import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { Branding } from '@/lib/types/domain';
import type { SprintAggregate } from '@/lib/data/aggregate';

const FALLBACK_PRIMARY = '#1677ff';
const FALLBACK_SECONDARY = '#13c2c2';

function safeColor(c: string | null | undefined, fallback: string): string {
  if (typeof c === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c.trim())) {
    return c.trim();
  }
  return fallback;
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 96,
    paddingBottom: 64,
    paddingHorizontal: 40,
    fontSize: 10,
    color: '#1f1f1f',
    fontFamily: 'Helvetica',
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 68,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 32,
    height: 32,
    marginRight: 12,
    objectFit: 'contain',
  },
  companyName: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },
  headerTag: {
    color: '#ffffff',
    fontSize: 9,
    opacity: 0.9,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: '#595959',
    marginBottom: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 4,
    padding: 10,
  },
  kpiLabel: {
    fontSize: 8,
    color: '#8c8c8c',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e8e8e8',
    borderRadius: 4,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerRow: {
    flexDirection: 'row',
  },
  cell: {
    padding: 6,
    fontSize: 9,
  },
  headerCell: {
    padding: 6,
    fontSize: 9,
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
  },
  colSprint: { flex: 2.4 },
  colNum: { flex: 1, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#8c8c8c',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
  },
  empty: {
    padding: 24,
    textAlign: 'center',
    color: '#8c8c8c',
    fontSize: 10,
  },
});

function carryPct(a: SprintAggregate): number {
  const load = a.committedPoints + a.carryOverPoints;
  return load > 0 ? Math.round((a.carryOverPoints / load) * 100) : 0;
}

export function buildReport({
  branding,
  aggregates,
  generatedAt,
}: {
  branding: Branding;
  aggregates: SprintAggregate[];
  generatedAt: string;
}) {
  const primary = safeColor(branding?.primaryColor, FALLBACK_PRIMARY);
  const secondary = safeColor(branding?.secondaryColor, FALLBACK_SECONDARY);
  const companyName = branding?.companyName || 'Carrito';
  const logoUrl = branding?.logoUrl || null;

  const totals = aggregates.reduce(
    (acc, a) => {
      acc.committed += a.committedPoints;
      acc.carryOver += a.carryOverPoints;
      acc.completed += a.completedPoints;
      return acc;
    },
    { committed: 0, carryOver: 0, completed: 0 },
  );
  const totalLoad = totals.committed + totals.carryOver;
  const avgCarryPct = totalLoad > 0 ? Math.round((totals.carryOver / totalLoad) * 100) : 0;

  const round1 = (x: number) => Math.round(x * 10) / 10;

  return (
    <Document title="Sprint Capacity & Carry-over Report" author={companyName}>
      <Page size="A4" style={styles.page}>
        {/* Fixed header bar */}
        <View style={[styles.headerBar, { backgroundColor: primary }]} fixed>
          <View style={styles.headerLeft}>
            {logoUrl ? <Image style={styles.logo} src={logoUrl} /> : null}
            <Text style={styles.companyName}>{companyName}</Text>
          </View>
          <Text style={styles.headerTag}>Sprint Capacity Report</Text>
        </View>

        <Text style={styles.title}>Sprint Capacity &amp; Carry-over Report</Text>
        <Text style={styles.subtitle}>Generated {generatedAt}</Text>

        {/* KPI row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Sprints</Text>
            <Text style={[styles.kpiValue, { color: primary }]}>{aggregates.length}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Committed pts</Text>
            <Text style={[styles.kpiValue, { color: primary }]}>{round1(totals.committed)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Carry-over pts</Text>
            <Text style={[styles.kpiValue, { color: secondary }]}>{round1(totals.carryOver)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Completed pts</Text>
            <Text style={[styles.kpiValue, { color: primary }]}>{round1(totals.completed)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Avg carry-over</Text>
            <Text style={[styles.kpiValue, { color: secondary }]}>{avgCarryPct}%</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Per-sprint breakdown</Text>

        {aggregates.length ? (
          <View style={styles.table}>
            <View style={[styles.headerRow, { backgroundColor: primary }]} fixed>
              <Text style={[styles.headerCell, styles.colSprint]}>Sprint</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Committed</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Carry-over</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Completed</Text>
              <Text style={[styles.headerCell, styles.colNum]}>Carry-over %</Text>
            </View>
            {aggregates.map((a, i) => (
              <View
                key={a.sprintId}
                style={[
                  styles.row,
                  { backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa' },
                ]}
                wrap={false}
              >
                <Text style={[styles.cell, styles.colSprint]}>{a.name}</Text>
                <Text style={[styles.cell, styles.colNum]}>{round1(a.committedPoints)}</Text>
                <Text style={[styles.cell, styles.colNum]}>{round1(a.carryOverPoints)}</Text>
                <Text style={[styles.cell, styles.colNum]}>{round1(a.completedPoints)}</Text>
                <Text style={[styles.cell, styles.colNum]}>{carryPct(a)}%</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No sprint data available yet.</Text>
        )}

        {/* Fixed footer with page numbers */}
        <View style={styles.footer} fixed>
          <Text>{companyName} · Carrito</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
          <Text>{generatedAt}</Text>
        </View>
      </Page>
    </Document>
  );
}
