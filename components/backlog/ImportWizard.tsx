'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Empty,
  Input,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  CheckCircleOutlined,
  DownloadOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import PageHeader from '@/components/common/PageHeader';
import { createClient } from '@/lib/supabase/client';
import { FIELD_DEFS, type CarritoField, type ColumnMapping } from '@/lib/ado/fields';
import { autoMap, parseCsv, transformRows, type RowError, type StoryImportRow } from '@/lib/ado/parse';
import { downloadCsv, errorsToCsv } from '@/lib/ado/export';
import { createImportBatch, upsertStories } from '@/lib/ado/upsert';

const { Text, Paragraph } = Typography;
const { Dragger } = Upload;
const { RangePicker } = DatePicker;

const REQUIRED_FIELDS: CarritoField[] = FIELD_DEFS.filter((f) => f.required).map((f) => f.field);

type SprintLite = { id: string; name: string };
type MemberLite = { id: string; email: string | null };

interface ImportOutcome {
  total: number;
  chunks: number;
  sprintId: string;
}

export default function ImportWizard({
  teamId,
  teamName,
  sprints,
  members,
  defaultSprintLengthDays,
}: {
  teamId: string;
  teamName: string;
  sprints: SprintLite[];
  members: MemberLite[];
  defaultSprintLengthDays: number;
}) {
  const router = useRouter();
  const { message } = App.useApp();

  const [step, setStep] = useState(0);

  // Step 1: upload
  const [filename, setFilename] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<Record<string, string>[]>([]);

  // Step 2: mapping
  const [mapping, setMapping] = useState<ColumnMapping>({});

  // Step 3: target sprint
  const [createNew, setCreateNew] = useState(false);
  const [existingSprintId, setExistingSprintId] = useState<string | undefined>(sprints[0]?.id);
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintRange, setNewSprintRange] = useState<[Dayjs, Dayjs] | null>(null);

  // Step 5: import
  const [importing, setImporting] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  // Derived review data
  const review = useMemo(() => {
    if (!data.length) {
      return { rows: [] as StoryImportRow[], errors: [] as RowError[], headers };
    }
    return transformRows(data, mapping, headers);
  }, [data, mapping, headers]);

  const requiredMapped = REQUIRED_FIELDS.every((f) => !!mapping[f]);

  async function handleFile(file: File) {
    try {
      const parsed = await parseCsv(file);
      if (!parsed.headers.length) {
        message.error('Could not read any columns from that file. Is it a valid CSV?');
        return;
      }
      setFilename(file.name);
      setHeaders(parsed.headers);
      setData(parsed.data);
      setMapping(autoMap(parsed.headers));
      setStep(1);
      message.success(`Loaded ${parsed.data.length} rows from ${file.name}`);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Failed to parse the CSV file');
    }
  }

  function setFieldMapping(field: CarritoField, header: string | null) {
    setMapping((prev) => ({ ...prev, [field]: header }));
  }

  function goToTarget() {
    if (!requiredMapped) {
      message.error('Map the required fields (Work Item ID and Title) before continuing.');
      return;
    }
    setStep(2);
  }

  function validateTarget(): boolean {
    if (createNew) {
      if (!newSprintName.trim()) {
        message.error('Enter a name for the new sprint.');
        return false;
      }
      if (!newSprintRange || !newSprintRange[0] || !newSprintRange[1]) {
        message.error('Pick a start and end date for the new sprint.');
        return false;
      }
    } else if (!existingSprintId) {
      message.error('Select a target sprint, or create a new one.');
      return false;
    }
    return true;
  }

  function goToReview() {
    if (!validateTarget()) return;
    setStep(3);
  }

  function downloadErrors() {
    if (!review.errors.length) return;
    const csv = errorsToCsv(review.errors);
    downloadCsv(csv, `import-errors-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function runImport() {
    if (!validateTarget()) {
      setStep(2);
      return;
    }
    if (!review.rows.length) {
      message.error('There are no valid rows to import.');
      return;
    }

    setImporting(true);
    const supabase = createClient();
    try {
      let sprintId = existingSprintId ?? '';

      if (createNew) {
        const { data: created, error } = await supabase
          .from('sprints')
          .insert({
            team_id: teamId,
            name: newSprintName.trim(),
            start_date: newSprintRange![0].format('YYYY-MM-DD'),
            end_date: newSprintRange![1].format('YYYY-MM-DD'),
          })
          .select('id')
          .single();
        if (error) throw new Error(`Could not create sprint: ${error.message}`);
        sprintId = (created as { id: string }).id;
      }

      if (!sprintId) throw new Error('No target sprint resolved.');

      const memberByEmail = new Map(
        members
          .filter((m): m is MemberLite & { email: string } => !!m.email)
          .map((m) => [m.email.toLowerCase(), m.id]),
      );

      const batchId = await createImportBatch(supabase, {
        teamId,
        sprintId,
        filename: filename || 'import.csv',
        rowCount: review.rows.length,
        headers,
      });

      const res = await upsertStories(supabase, {
        teamId,
        sprintId,
        batchId,
        rows: review.rows,
        memberByEmail,
      });

      setOutcome({ total: res.total, chunks: res.chunks, sprintId });
      setStep(4);
      message.success(`Imported ${res.total} stories`);
      router.refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function startOver() {
    setStep(0);
    setFilename('');
    setHeaders([]);
    setData([]);
    setMapping({});
    setCreateNew(false);
    setExistingSprintId(sprints[0]?.id);
    setNewSprintName('');
    setNewSprintRange(null);
    setOutcome(null);
  }

  const headerOptions = [
    { value: '', label: '— None —' },
    ...headers.map((h) => ({ value: h, label: h })),
  ];

  const mappingColumns: ColumnsType<(typeof FIELD_DEFS)[number]> = [
    {
      title: 'Carrito Field',
      key: 'label',
      render: (_, def) => (
        <Space>
          <Text strong>{def.label}</Text>
          {def.required && <Tag color="red">required</Tag>}
        </Space>
      ),
    },
    {
      title: 'CSV Column',
      key: 'column',
      render: (_, def) => (
        <Select
          style={{ width: '100%', minWidth: 200 }}
          value={mapping[def.field] ?? ''}
          status={def.required && !mapping[def.field] ? 'error' : undefined}
          onChange={(v) => setFieldMapping(def.field, v ? v : null)}
          options={headerOptions}
        />
      ),
    },
  ];

  const errorColumns: ColumnsType<RowError> = [
    { title: 'Row #', dataIndex: 'rowIndex', key: 'rowIndex', width: 100, render: (v: number) => v + 1 },
    { title: 'Field', dataIndex: 'field', key: 'field', width: 160, render: (v?: string) => v ?? '—' },
    { title: 'Problem', dataIndex: 'message', key: 'message' },
  ];

  return (
    <>
      <PageHeader
        title="Import from ADO"
        subtitle={`${teamName} · Azure DevOps CSV`}
        extra={
          <Link href="/backlog">
            <Button>Back to backlog</Button>
          </Link>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <Steps
          current={step}
          items={[
            { title: 'Upload' },
            { title: 'Map columns' },
            { title: 'Target sprint' },
            { title: 'Review' },
            { title: 'Import' },
          ]}
        />
      </Card>

      {step === 0 && (
        <Card>
          <Dragger
            accept=".csv"
            multiple={false}
            maxCount={1}
            beforeUpload={(file) => {
              void handleFile(file);
              return false;
            }}
            fileList={[] as UploadFile[]}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drag an Azure DevOps CSV export here</p>
            <p className="ant-upload-hint">
              Export your query results from Azure DevOps as CSV, then drop the file here. We never
              upload it anywhere until you confirm the import.
            </p>
          </Dragger>
        </Card>
      )}

      {step === 1 && (
        <Card
          title={`Map columns from ${filename}`}
          extra={
            <Space>
              <Button onClick={() => setStep(0)}>Back</Button>
              <Button type="primary" disabled={!requiredMapped} onClick={goToTarget}>
                Next
              </Button>
            </Space>
          }
        >
          {!requiredMapped && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="Map the required fields (Work Item ID and Title) to continue."
            />
          )}
          <Table
            rowKey="field"
            size="small"
            pagination={false}
            columns={mappingColumns}
            dataSource={FIELD_DEFS}
          />
        </Card>
      )}

      {step === 2 && (
        <Card
          title="Target sprint"
          extra={
            <Space>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button type="primary" onClick={goToReview}>
                Next
              </Button>
            </Space>
          }
        >
          <Paragraph type="secondary">
            All imported stories will be assigned to this sprint.
          </Paragraph>
          <Space align="center" style={{ marginBottom: 16 }}>
            <Text>Create a new sprint</Text>
            <Switch checked={createNew} onChange={setCreateNew} />
          </Space>

          {createNew ? (
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Text>Sprint name</Text>
                <Input
                  style={{ marginTop: 8 }}
                  placeholder="e.g. Sprint 24"
                  value={newSprintName}
                  onChange={(e) => setNewSprintName(e.target.value)}
                />
              </Col>
              <Col xs={24} md={12}>
                <Text>Dates</Text>
                <div style={{ marginTop: 8 }}>
                  <RangePicker
                    style={{ width: '100%' }}
                    value={newSprintRange}
                    onChange={(vals) => {
                      if (vals && vals[0] && vals[1]) setNewSprintRange([vals[0], vals[1]]);
                      else setNewSprintRange(null);
                    }}
                  />
                  <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                    Default sprint length is {defaultSprintLengthDays} days.
                  </Text>
                </div>
              </Col>
            </Row>
          ) : sprints.length ? (
            <div>
              <Text>Existing sprint</Text>
              <Select
                showSearch
                optionFilterProp="label"
                style={{ width: '100%', maxWidth: 400, marginTop: 8, display: 'block' }}
                value={existingSprintId}
                onChange={setExistingSprintId}
                options={sprints.map((s) => ({ value: s.id, label: s.name }))}
              />
            </div>
          ) : (
            <Empty description="No sprints yet — turn on “Create a new sprint” above." />
          )}
        </Card>
      )}

      {step === 3 && (
        <Card
          title="Review"
          extra={
            <Space>
              <Button onClick={() => setStep(2)}>Back</Button>
              <Button
                type="primary"
                disabled={!review.rows.length}
                loading={importing}
                onClick={runImport}
              >
                Import {review.rows.length} stories
              </Button>
            </Space>
          }
        >
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={8}>
              <Card>
                <Statistic
                  title="Ready to import"
                  value={review.rows.length}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#3f8600' }}
                />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card>
                <Statistic
                  title="Rows with errors"
                  value={review.errors.length}
                  prefix={<WarningOutlined />}
                  valueStyle={{ color: review.errors.length ? '#cf1322' : undefined }}
                />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card>
                <Statistic title="Total rows in file" value={data.length} />
              </Card>
            </Col>
          </Row>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              createNew
                ? `New sprint “${newSprintName}” will be created and all stories assigned to it.`
                : `Stories will be assigned to “${
                    sprints.find((s) => s.id === existingSprintId)?.name ?? '—'
                  }”.`
            }
          />

          {review.errors.length > 0 && (
            <>
              <Divider orientation="left">Skipped rows</Divider>
              <Space style={{ marginBottom: 12 }}>
                <Button icon={<DownloadOutlined />} onClick={downloadErrors}>
                  Download error rows
                </Button>
                <Text type="secondary">These rows will not be imported.</Text>
              </Space>
              <Table
                rowKey={(r) => `${r.rowIndex}-${r.field ?? ''}`}
                size="small"
                columns={errorColumns}
                dataSource={review.errors}
                pagination={{ pageSize: 10 }}
              />
            </>
          )}
        </Card>
      )}

      {step === 4 && outcome && (
        <Card>
          <Result
            status="success"
            title={`Imported ${outcome.total} stories`}
            subTitle={`Processed in ${outcome.chunks} ${outcome.chunks === 1 ? 'batch' : 'batches'}.`}
            extra={[
              <Link key="view" href={`/backlog?sprint=${outcome.sprintId}`}>
                <Button type="primary">View backlog</Button>
              </Link>,
              <Button key="again" onClick={startOver}>
                Import another file
              </Button>,
            ]}
          />
        </Card>
      )}
    </>
  );
}
