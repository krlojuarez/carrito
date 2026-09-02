'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Typography,
} from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { createClient } from '@/lib/supabase/client';
import type { CloseSprintResult } from '@/lib/metrics/types';

const { Text, Paragraph } = Typography;

type RolloverMode = 'existing' | 'create' | 'none';

export interface SprintOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

/**
 * Closing a sprint used to mean: retype the velocity row, hand-type a carry-over
 * value per unfinished story, then paste those stories into the next sprint's
 * tab. This runs public.close_sprint() instead, which does all three in one
 * transaction.
 */
export default function CloseSprintModal({
  teamId,
  sprintId,
  sprintName,
  sprintEnd,
  otherSprints,
  defaultSprintLengthDays,
  unfinishedCount,
  unfinishedPoints,
}: {
  teamId: string;
  sprintId: string;
  sprintName: string;
  sprintEnd: string;
  otherSprints: SprintOption[];
  defaultSprintLengthDays: number;
  unfinishedCount: number;
  unfinishedPoints: number;
}) {
  const router = useRouter();
  const { message } = App.useApp();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<RolloverMode>('create');
  const [targetId, setTargetId] = useState<string | undefined>();
  const [newName, setNewName] = useState('');
  const [newRange, setNewRange] = useState<[Dayjs, Dayjs] | null>(null);

  // Candidate "next" sprints: anything starting after this one ends.
  const laterSprints = useMemo(
    () => otherSprints.filter((s) => s.startDate > sprintEnd).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [otherSprints, sprintEnd],
  );

  function openModal() {
    const nextStart = dayjs(sprintEnd).add(1, 'day');
    const nextEnd = nextStart.add(Math.max(defaultSprintLengthDays, 1) - 1, 'day');
    setNewRange([nextStart, nextEnd]);
    setNewName(suggestNextName(sprintName));
    setTargetId(laterSprints[0]?.id);
    setMode(laterSprints.length ? 'existing' : 'create');
    setOpen(true);
  }

  function suggestNextName(name: string): string {
    // "Sprint 17" -> "Sprint 18"; "26.17" -> "26.18"; otherwise leave blank.
    const m = name.match(/^(.*?)(\d+)(\D*)$/);
    if (!m) return '';
    return `${m[1]}${String(Number(m[2]) + 1)}${m[3]}`;
  }

  async function run() {
    setBusy(true);
    const supabase = createClient();
    try {
      let nextSprintId: string | null = null;

      if (mode === 'existing') {
        if (!targetId) throw new Error('Pick the sprint to roll unfinished work into.');
        nextSprintId = targetId;
      } else if (mode === 'create') {
        if (!newName.trim()) throw new Error('Name the next sprint.');
        if (!newRange?.[0] || !newRange?.[1]) throw new Error('Pick the next sprint dates.');
        const { data, error } = await supabase
          .from('sprints')
          .insert({
            team_id: teamId,
            name: newName.trim(),
            start_date: newRange[0].format('YYYY-MM-DD'),
            end_date: newRange[1].format('YYYY-MM-DD'),
          })
          .select('id')
          .single();
        if (error) throw new Error(`Could not create the next sprint: ${error.message}`);
        nextSprintId = (data as { id: string }).id;
      }

      const { data: result, error: rpcError } = await supabase.rpc('close_sprint', {
        p_sprint_id: sprintId,
        p_next_sprint_id: nextSprintId,
        p_carry_forward: mode !== 'none',
      });
      if (rpcError) throw new Error(rpcError.message);

      const r = result as CloseSprintResult | null;
      message.success(
        r
          ? `${sprintName} closed · ${r.completed_points} of ${r.committed_points} SP done` +
              (r.stories_moved ? ` · ${r.stories_moved} stories rolled forward` : '')
          : `${sprintName} closed`,
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Could not close the sprint');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="primary" icon={<CheckCircleOutlined />} onClick={openModal}>
        Close sprint
      </Button>

      <Modal
        open={open}
        title={`Close ${sprintName}`}
        onCancel={() => setOpen(false)}
        onOk={run}
        okText="Close sprint"
        confirmLoading={busy}
        width={620}
        destroyOnHidden
      >
        <Paragraph type="secondary">
          Carrito will stamp this sprint&apos;s velocity, mark every unfinished story as carry-over
          with its remaining points, and (optionally) move that work into the next sprint.
        </Paragraph>

        <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Unfinished stories">
            {unfinishedCount} ({unfinishedPoints} SP) will be flagged as carry-over
          </Descriptions.Item>
        </Descriptions>

        {unfinishedCount === 0 && (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            message="Nothing is unfinished — this sprint closes clean."
          />
        )}

        <Divider orientation="left" plain>
          Roll unfinished work into
        </Divider>

        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value as RolloverMode)}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <Radio value="existing" disabled={!laterSprints.length}>
            <Space direction="vertical" size={4}>
              <Text>An existing sprint</Text>
              {mode === 'existing' && (
                <Select
                  style={{ minWidth: 320 }}
                  value={targetId}
                  onChange={setTargetId}
                  options={laterSprints.map((s) => ({
                    value: s.id,
                    label: `${s.name} (${s.startDate} → ${s.endDate})`,
                  }))}
                  placeholder="Pick the next sprint"
                />
              )}
            </Space>
          </Radio>

          <Radio value="create">
            <Space direction="vertical" size={4}>
              <Text>A new sprint, created now</Text>
              {mode === 'create' && (
                <Space wrap>
                  <Input
                    style={{ width: 180 }}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Sprint name"
                  />
                  <DatePicker.RangePicker
                    value={newRange}
                    onChange={(v) => setNewRange(v as [Dayjs, Dayjs] | null)}
                  />
                </Space>
              )}
            </Space>
          </Radio>

          <Radio value="none">
            <Text>Nowhere — just close this sprint</Text>
          </Radio>
        </Radio.Group>
      </Modal>
    </>
  );
}
