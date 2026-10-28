import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SaveCancelledError, saveResultJson, shareResultJson } from '../../lib/exportResult';
import { getLastRun, requestFormReset } from '../../lib/runStore';

const VERDICTS: Record<string, { label: string; color: string; note: string }> = {
  conforming: { label: 'CONFORMING', color: '#1f8a4c', note: 'Meets the inspection criteria.' },
  defective: { label: 'DEFECTIVE', color: '#c84a45', note: 'A defect was detected.' },
  uncertain: { label: 'UNCERTAIN', color: '#d99a1a', note: 'Needs a human check.' },
};

// Backend sends confidence as 0-1; tolerate 0-100 too.
function toPercent(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.round(value <= 1 ? value * 100 : value)}%`;
}

function prettyKey(key: string) {
  return key.replace(/_seconds$/, '').replace(/_/g, ' ');
}

function formatSeconds(value: unknown) {
  return typeof value === 'number' ? `${value.toFixed(2)} s` : '—';
}

export default function ResultsScreen() {
  const router = useRouter();
  const { run, imageUri } = getLastRun();
  const result = run?.results?.[0];
  const [showReasoning, setShowReasoning] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (!run || !result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No result to show. Run an inspection first.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const verdictKey = String(result.verdict ?? '').toLowerCase();
  const verdict = VERDICTS[verdictKey] ?? {
    label: String(result.verdict ?? 'UNKNOWN').toUpperCase(),
    color: '#60737e',
    note: '',
  };

  const timing = result.timing ? Object.entries(result.timing) : [];
  const totalRun = run.timing_summary?.total_run_seconds;

  async function handleDownload(forcePick = false) {
    if (!run) return;
    setExporting(true);
    try {
      const saved = await saveResultJson(run, forcePick);
      if (saved) {
        Alert.alert('Saved', `${saved.fileName}\n\nSaved in: ${saved.folder}`);
      }
    } catch (e) {
      if (e instanceof SaveCancelledError) return; // user closed the folder picker
      Alert.alert('Download failed', e instanceof Error ? e.message : 'Could not save the file.');
    } finally {
      setExporting(false);
    }
  }

  async function handleShare() {
    if (!run) return;
    try {
      await shareResultJson(run);
    } catch (e) {
      Alert.alert('Share failed', e instanceof Error ? e.message : 'Could not share the file.');
    }
  }

  function handleNewInspection() {
    requestFormReset();
    router.back();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backLink}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Inspection Result</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.verdictCard, { backgroundColor: verdict.color }]}>
          <Text style={styles.verdictLabel}>{verdict.label}</Text>
          {verdict.note ? <Text style={styles.verdictNote}>{verdict.note}</Text> : null}
        </View>

        {run.product ? (
          <Text style={styles.metaLine}>
            {run.product} · {run.mode === 'with_references' ? 'with reference images' : 'prompt only'}
          </Text>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{toPercent(result.confidence_score)}</Text>
            <Text style={styles.statLabel}>Confidence</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {typeof result.defect_percentage === 'number' ? `${result.defect_percentage}%` : '—'}
            </Text>
            <Text style={styles.statLabel}>Defect coverage</Text>
          </View>
        </View>

        {imageUri ? <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="cover" /> : null}

        <Field label="Finding" value={result.finding} />
        <Field label="Assessment" value={result.assessment} />
        <Field label="Location" value={result.location} />

        {result.reasoning ? (
          <View style={styles.field}>
            <TouchableOpacity onPress={() => setShowReasoning((v) => !v)}>
              <Text style={styles.fieldLabel}>
                Reasoning {showReasoning ? '▾' : '▸'}
              </Text>
            </TouchableOpacity>
            {showReasoning ? <Text style={styles.fieldValue}>{result.reasoning}</Text> : null}
          </View>
        ) : null}

        {timing.length > 0 || typeof totalRun === 'number' ? (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Timing</Text>
            {timing.map(([key, value]) => (
              <Text key={key} style={styles.timingLine}>
                {prettyKey(key)}: {formatSeconds(value)}
              </Text>
            ))}
            {typeof totalRun === 'number' ? (
              <Text style={styles.timingLine}>total run: {formatSeconds(totalRun)}</Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity style={styles.primaryButton} onPress={handleNewInspection}>
          <Text style={styles.primaryButtonText}>New inspection</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, exporting && styles.disabled]}
          onPress={() => handleDownload(false)}
          disabled={exporting}
        >
          <Text style={styles.secondaryButtonText}>{exporting ? 'Saving…' : 'Download JSON'}</Text>
        </TouchableOpacity>
        {Platform.OS === 'android' ? (
          <TouchableOpacity onPress={() => handleDownload(true)} disabled={exporting}>
            <Text style={styles.smallLink}>Change download folder</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
          <Text style={styles.secondaryButtonText}>Share JSON</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.linkText}>Back to form (keep my inputs)</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f7' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  backLink: { fontSize: 14, fontWeight: '700', color: '#007d77', width: 50 },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#143149' },
  container: { padding: 20, paddingBottom: 50 },
  verdictCard: { borderRadius: 10, paddingVertical: 20, alignItems: 'center' },
  verdictLabel: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  verdictNote: { color: '#fff', fontSize: 12, marginTop: 4, opacity: 0.95 },
  metaLine: { marginTop: 10, fontSize: 12, color: '#687985', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  statBox: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccd9dd', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#143149' },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#52636d', textTransform: 'uppercase', marginTop: 2 },
  photo: { width: '100%', height: 200, borderRadius: 8, marginTop: 16, backgroundColor: '#edf4f4' },
  field: { marginTop: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: '#52636d', textTransform: 'uppercase', marginBottom: 4 },
  fieldValue: { fontSize: 14, color: '#32454f', lineHeight: 20 },
  timingLine: { fontSize: 12, color: '#687985', textTransform: 'capitalize' },
  primaryButton: { marginTop: 28, backgroundColor: '#007d77', paddingVertical: 14, borderRadius: 6, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  secondaryButton: { marginTop: 12, borderWidth: 1.5, borderColor: '#007d77', paddingVertical: 13, borderRadius: 6, alignItems: 'center' },
  secondaryButtonText: { color: '#007d77', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  smallLink: { marginTop: 8, textAlign: 'center', color: '#007d77', fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  linkText: { marginTop: 16, textAlign: 'center', color: '#687985', fontSize: 12, fontWeight: '700' },
  empty: { flex: 1, padding: 24, justifyContent: 'center' },
  emptyText: { textAlign: 'center', color: '#52636d', fontSize: 14 },
});