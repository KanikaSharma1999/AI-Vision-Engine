import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, submitInspection, testConnection, type InspectionPayload } from '../../lib/api';
import { consumeFormReset, setLastRun } from '../../lib/runStore';
import { clearServerUrl, getServerUrl, setServerUrl } from '../../lib/storage';
import MainScreen from '../../screens/MainScreen';

// NOTE: the settings modal below is a deliberately minimal placeholder until
// Phase 7 (the real Settings screen/route). The underlying storage.js logic it
// uses is the same logic Phase 7 will build its proper UI on top of.
export default function Index() {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0); // bumping this remounts MainScreen = blank form
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [testing, setTesting] = useState(false);

  // "New inspection" on the Results screen asks for a blank form.
  useFocusEffect(
    useCallback(() => {
      if (consumeFormReset()) setFormKey((k) => k + 1);
    }, [])
  );

  useEffect(() => {
    getServerUrl().then((url) => {
      setUrlInput(url);
      setSavedUrl(url);
    });
  }, []);

  async function handleOpenSettings() {
    const current = await getServerUrl();
    setUrlInput(current);
    setSettingsVisible(true);
  }
  
  async function handlePasteFromClipboard() {
    const text = await Clipboard.getStringAsync();
    if (!text) {
      Alert.alert('Clipboard empty', 'Copy the ngrok URL first, then tap Paste.');
      return;
    }
    setUrlInput(text.trim());
  }

  async function handleTestConnection() {
    const trimmed = urlInput.trim();
    if (!trimmed || !/^https?:\/\//.test(trimmed)) {
      Alert.alert('Invalid URL', 'Enter a full URL starting with http:// or https://');
      return;
    }
    setTesting(true);
    const result = await testConnection(trimmed);
    setTesting(false);
    if (result.ok) {
      Alert.alert('Connection OK', `Server responded successfully (HTTP ${result.status}).`);
    } else {
      Alert.alert(
        'Connection failed',
        result.error
          ? `Could not reach this URL: ${result.error}`
          : `Server responded with HTTP ${result.status}.`
      );
    }
  }
  
  async function handleClearUrl() {
    await clearServerUrl();
    setUrlInput('');
    setSavedUrl('');
    Alert.alert('Cleared', 'Saved server URL was removed. Paste and save a fresh one.');
  }

  async function handleSaveSettings() {
    const trimmed = urlInput.trim();
    if (!trimmed || !/^https?:\/\//.test(trimmed)) {
      Alert.alert('Invalid URL', 'Enter a full URL starting with http:// or https://');
      return;
    }
    await setServerUrl(trimmed);
    const verify = await getServerUrl();
    setSavedUrl(verify);
    if (verify !== trimmed) {
      Alert.alert('Save mismatch', `Saved value does not match what was entered.\nEntered: ${trimmed}\nStored: ${verify}`);
    }
    setSettingsVisible(false);
  }

  async function handleSubmit(payload: InspectionPayload) {
    setIsSubmitting(true);
    try {
      const run = await submitInspection(payload);
      const result = run.results?.[0];

      if (!result) {
        Alert.alert('Inspection error', 'The server returned no inspection result.');
        return;
      }

      if (result.error) {
        Alert.alert('Inspection error', result.error);
        return;
      }

      setLastRun(run, payload.testImage?.uri ?? null);
      router.push('/results');
    } catch (err) {
      const message = err instanceof ApiError || err instanceof Error ? err.message : 'Unexpected error.';
      Alert.alert('Request failed', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.serverBanner}>
        <Text style={styles.serverBannerText} numberOfLines={1}>
          {savedUrl ? `Server: ${savedUrl}` : 'No server URL set — open Settings'}
        </Text>
      </View>

      <MainScreen key={formKey} onSubmit={handleSubmit} onOpenSettings={handleOpenSettings} isSubmitting={isSubmitting} />

      <Modal visible={settingsVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Server URL</Text>
            <Text style={styles.modalHint}>
              Paste the current ngrok URL (e.g. https://abcd1234.ngrok-free.dev). Use Paste to
              avoid keyboard autocorrect changing it while typing.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="https://..."
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              keyboardType="url"
            />
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalSecondary} onPress={handlePasteFromClipboard}>
                <Text style={styles.modalSecondaryText}>Paste</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSecondary} onPress={handleTestConnection} disabled={testing}>
                <Text style={styles.modalSecondaryText}>{testing ? 'Testing…' : 'Test Connection'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={handleClearUrl}>
                <Text style={styles.modalClearText}>Clear saved URL</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setSettingsVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={handleSaveSettings}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f7' },
  serverBanner: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  serverBannerText: { fontSize: 10.5, color: '#687985', fontFamily: 'monospace' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(20,49,73,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 10, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#143149', marginBottom: 6 },
  modalHint: { fontSize: 12, color: '#687985', marginBottom: 14 },
  modalInput: { borderWidth: 1, borderColor: '#ccd9dd', borderRadius: 6, padding: 12, fontSize: 14, marginBottom: 12 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginBottom: 4 },
  modalSecondary: { borderWidth: 1, borderColor: '#007d77', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6 },
  modalSecondaryText: { color: '#007d77', fontWeight: '700', fontSize: 12 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalCancelText: { color: '#687985', fontWeight: '700' },
  modalClearText: { color: '#c84a45', fontWeight: '700', fontSize: 12 },
  modalSave: { backgroundColor: '#007d77', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 6 },
  modalSaveText: { color: '#fff', fontWeight: '800' },
});
