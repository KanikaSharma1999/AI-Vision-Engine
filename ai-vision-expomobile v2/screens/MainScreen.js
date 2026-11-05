import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const MAX_REFERENCE_IMAGES = 5;

// onSubmit is called with a validated payload once the user taps "Run
// Inspection". Actual network submission is wired in Phase 5 — for now the
// caller (App.js) can just log/alert the payload to confirm this screen
// works end-to-end.

const PRODUCT_OPTIONS = [
  'Washing machine',
  'Dishwasher',
  'Refrigerator',
  'Oven',
  'Microwave',
  'Others'
];

export default function MainScreen({ onSubmit, onOpenSettings, isSubmitting }) {
  const [productOption, setProductOption] = useState(PRODUCT_OPTIONS[0]);
  const [customProduct, setCustomProduct] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [extraNotes, setExtraNotes] = useState('');
  const [mode, setMode] = useState('with_references'); // "with_references" | "prompt_only"
  const [referenceImages, setReferenceImages] = useState([]); // array of {uri, ...}
  const [testImage, setTestImage] = useState(null); // {uri, ...} | null
  const [statusMessage, setStatusMessage] = useState('');

  // ---- reference image picking (gallery, multi-select, capped) ----------
  async function pickReferenceImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to add reference images.');
      return;
    }

    const remaining = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (remaining <= 0) {
      setStatusMessage(`Only ${MAX_REFERENCE_IMAGES} reference images are allowed.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (result.canceled) return;

    const picked = result.assets || [];
    if (picked.length > remaining) {
      setStatusMessage(`Only ${MAX_REFERENCE_IMAGES} reference images are allowed — extra selections were skipped.`);
    }
    setReferenceImages((prev) => [...prev, ...picked.slice(0, remaining)]);
  }

  function removeReferenceImage(index) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- inspection image picking (camera OR gallery, single image) -------
  async function pickTestImage() {
    Alert.alert('Add inspection image', 'Choose a source', [
      { text: 'Take Photo', onPress: takeTestPhoto },
      { text: 'Choose from Gallery', onPress: chooseTestFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function takeTestPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      setTestImage(result.assets[0]);
    }
  }

  async function chooseTestFromGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required to choose an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setTestImage(result.assets[0]);
    }
  }

  // ---- submit / validation, mirrors the existing web app's app.js -------
  function handleSubmit() {
    setStatusMessage('');

    const trimmedProduct = productOption === 'Others' ? customProduct.trim() : productOption;
    if (!trimmedProduct) {
      setStatusMessage('Enter the product to inspect (e.g. washing machine).');
      return;
    }
    if (!testImage) {
      setStatusMessage('Add a test image to inspect.');
      return;
    }
    if (mode === 'with_references' && referenceImages.length === 0) {
      setStatusMessage(
        'No reference images added — add at least one, or set "Add reference image?" to No.'
      );
      return;
    }

    onSubmit({
      product: trimmedProduct,
      extraNotes: extraNotes.trim(),
      mode,
      referenceImages,
      testImage,
    });
  }
    
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Amalgamation Inspector</Text>
        <TouchableOpacity onPress={onOpenSettings}>
          <Text style={styles.settingsLink}>Settings</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Product</Text>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={productOption} onValueChange={setProductOption}>
          {PRODUCT_OPTIONS.map((opt) => (
            <Picker.Item key={opt} label={opt} value={opt} />
          ))}
        </Picker>
      </View>
      {productOption === 'Others' && (
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          placeholder="Enter product name"
          value={customProduct}
          onChangeText={setCustomProduct}
        />
      )}

      <TouchableOpacity onPress={() => setShowNotes((v) => !v)}>
        <Text style={styles.notesToggle}>{showNotes ? '– Hide additional notes' : '+ Add additional notes (optional)'}</Text>
      </TouchableOpacity>
      {showNotes && (
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Optional extra detail to append to the inspection prompt"
          value={extraNotes}
          onChangeText={setExtraNotes}
          multiline
          numberOfLines={3}
        />
      )}

      <Text style={styles.label}>Add reference image?</Text>
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeOption, mode === 'with_references' && styles.modeOptionActive]}
          onPress={() => setMode('with_references')}
        >
          <Text style={[styles.modeOptionText, mode === 'with_references' && styles.modeOptionTextActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeOption, mode === 'prompt_only' && styles.modeOptionActive]}
          onPress={() => setMode('prompt_only')}
        >
          <Text style={[styles.modeOptionText, mode === 'prompt_only' && styles.modeOptionTextActive]}>No</Text>
        </TouchableOpacity>
      </View>

      {mode === 'with_references' && (
        <View style={styles.section}>
          <Text style={styles.label}>Reference images (up to {MAX_REFERENCE_IMAGES})</Text>
          <TouchableOpacity style={styles.dropzone} onPress={pickReferenceImages}>
            <Text style={styles.dropzoneText}>+ Add approved reference images</Text>
          </TouchableOpacity>
          <View style={styles.thumbRow}>
            {referenceImages.map((img, idx) => (
              <View key={img.uri} style={styles.thumbWrap}>
                <Image source={{ uri: img.uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removeReferenceImage(idx)}>
                  <Text style={styles.thumbRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Inspection image</Text>
        <TouchableOpacity style={styles.dropzone} onPress={pickTestImage}>
          <Text style={styles.dropzoneText}>+ Add image for inspection</Text>
        </TouchableOpacity>
        {testImage && (
          <View style={styles.thumbWrap}>
            <Image source={{ uri: testImage.uri }} style={styles.thumb} />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => setTestImage(null)}>
              <Text style={styles.thumbRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.runButton, isSubmitting && styles.runButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        <Text style={styles.runButtonText}>
          {isSubmitting ? (mode === 'with_references' ? 'Comparing against references…' : 'Inspecting…') : 'Run Inspection'}
        </Text>
      </TouchableOpacity>

      {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pickerWrap: { borderWidth: 1, borderColor: '#ccd9dd', borderRadius: 6, backgroundColor: '#fbfcfc', overflow: 'hidden' },
  container: { padding: 20, paddingTop: 50, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#143149' },
  settingsLink: { fontSize: 13, color: '#007d77', fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '800', color: '#52636d', textTransform: 'uppercase', marginBottom: 8, marginTop: 14 },
  input: { borderWidth: 1, borderColor: '#ccd9dd', borderRadius: 6, padding: 12, backgroundColor: '#fbfcfc', fontSize: 14 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  notesToggle: { color: '#007d77', fontSize: 12, fontWeight: '700', marginTop: 10 },
  modeToggle: { flexDirection: 'row', borderWidth: 1, borderColor: '#ccd9dd', borderRadius: 6, overflow: 'hidden' },
  modeOption: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fbfcfc' },
  modeOptionActive: { backgroundColor: '#007d77' },
  modeOptionText: { fontSize: 12, fontWeight: '800', color: '#60737e' },
  modeOptionTextActive: { color: '#fff' },
  section: { marginTop: 6 },
  dropzone: { borderWidth: 1.5, borderColor: '#adc0c6', borderStyle: 'dashed', borderRadius: 6, padding: 18, alignItems: 'center', backgroundColor: '#f8fbfb' },
  dropzoneText: { color: '#60737e', fontSize: 12, fontWeight: '700' },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumbWrap: { position: 'relative', width: 72, height: 72, marginTop: 10 },
  thumb: { width: 72, height: 72, borderRadius: 5, backgroundColor: '#edf4f4' },
  thumbRemove: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, backgroundColor: '#c84a45', alignItems: 'center', justifyContent: 'center' },
  thumbRemoveText: { color: '#fff', fontSize: 14, lineHeight: 16 },
  runButton: { marginTop: 24, backgroundColor: '#007d77', paddingVertical: 14, borderRadius: 6, alignItems: 'center' },
  runButtonDisabled: { backgroundColor: '#aab8bd' },
  runButtonText: { color: '#fff', fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusText: { marginTop: 10, fontSize: 12, color: '#687985' },
});