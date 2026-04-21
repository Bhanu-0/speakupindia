import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, Switch, Alert, Image, ActivityIndicator, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { issueService } from '../services/issueService';
import { aiService } from '../services/aiService';
import { COLORS } from '../constants/theme';

const CATEGORIES = [
  { key: 'roads',      label: 'Roads & Infrastructure' },
  { key: 'power',      label: 'Power & Electricity' },
  { key: 'water',      label: 'Water Supply' },
  { key: 'sanitation', label: 'Sanitation & Waste' },
  { key: 'police',     label: 'Police & Law' },
  { key: 'corruption', label: 'Corruption' },
  { key: 'education',  label: 'Education' },
  { key: 'health',     label: 'Healthcare' },
  { key: 'environment',label: 'Environment' },
  { key: 'other',      label: 'Other' },
];

export default function ReportIssueScreen() {
  const navigation = useNavigation();

  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [category,    setCategory]    = useState(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [media,       setMedia]       = useState([]);   // { uri, type }[]
  const [location,    setLocation]    = useState(null);
  const [submitting,  setSubmitting]  = useState(false);

  // AI suggestion state
  const [aiSuggestion,    setAiSuggestion]    = useState(null); // { category, confidence }
  const [aiLoading,       setAiLoading]       = useState(false);

  // Auto-fetch location on mount
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const [place] = await Location.reverseGeocodeAsync({
        latitude:  loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      setLocation({
        coordinates: [loc.coords.longitude, loc.coords.latitude],
        address: `${place.name || ''}, ${place.district || ''}`.trim().replace(/^,\s*/, ''),
        district: place.district || place.subregion || '',
        state:    place.region || 'Maharashtra',
        pincode:  place.postalCode || '',
      });
    })();
  }, []);

  // AI categorization — debounced on description change
  useEffect(() => {
    if (description.length < 30) return;
    const t = setTimeout(async () => {
      setAiLoading(true);
      try {
        const result = await aiService.suggestCategory(title, description);
        setAiSuggestion(result);
        // Auto-apply if user hasn't manually selected
        if (!category && result.confidence > 0.8) {
          setCategory(result.category);
        }
      } catch { /* fail silently */ }
      setAiLoading(false);
    }, 800);
    return () => clearTimeout(t);
  }, [description, title]);

  const pickMedia = async () => {
    if (media.length >= 5) {
      return Alert.alert('Limit reached', 'You can attach up to 5 files.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      const newMedia = result.assets.slice(0, 5 - media.length).map(a => ({
        uri:  a.uri,
        type: a.type,
        name: a.fileName || `media_${Date.now()}`,
      }));
      setMedia(prev => [...prev, ...newMedia]);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim())   return Alert.alert('Required', 'Please add a title.');
    if (!description.trim()) return Alert.alert('Required', 'Please describe the issue.');
    if (!category)       return Alert.alert('Required', 'Please select a category.');
    if (!location)       return Alert.alert('Location', 'Fetching your location. Please wait.');

    setSubmitting(true);
    try {
      // Upload media first
      const media_urls = media.length > 0
        ? await issueService.uploadMedia(media)
        : [];

      const issue = await issueService.create({
        title:        title.trim(),
        description:  description.trim(),
        category,
        location,
        is_anonymous: isAnonymous,
        media_urls,
      });

      Alert.alert(
        'Issue reported!',
        'Your report has been submitted and is under review.',
        [{ text: 'View issue', onPress: () => navigation.replace('IssueDetail', { issueId: issue._id }) }]
      );
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.content}>

        {/* Media picker */}
        <TouchableOpacity style={styles.mediaBox} onPress={pickMedia}>
          {media.length === 0 ? (
            <>
              <Text style={styles.mediaIcon}>+</Text>
              <Text style={styles.mediaHint}>Add photo, video, or document</Text>
              <Text style={styles.mediaSubhint}>Stronger proof = faster action</Text>
            </>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
              {media.map((m, i) => (
                <View key={i} style={styles.mediaThumbnailWrap}>
                  <Image source={{ uri: m.uri }} style={styles.mediaThumbnail} />
                  <TouchableOpacity
                    style={styles.mediaRemove}
                    onPress={() => setMedia(prev => prev.filter((_, j) => j !== i))}
                  >
                    <Text style={styles.mediaRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {media.length < 5 && (
                <TouchableOpacity style={styles.mediaAddMore} onPress={pickMedia}>
                  <Text style={styles.mediaAddMoreText}>+</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </TouchableOpacity>

        {/* Title */}
        <Text style={styles.label}>Issue title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Large pothole blocking FC Road"
          placeholderTextColor="#B4B2A9"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />

        {/* Description */}
        <Text style={styles.label}>Description *</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Describe the issue in detail — what, where, how long, who is affected..."
          placeholderTextColor="#B4B2A9"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={2000}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{description.length}/2000</Text>

        {/* AI suggestion */}
        {(aiLoading || aiSuggestion) && (
          <View style={styles.aiBox}>
            {aiLoading ? (
              <ActivityIndicator size="small" color={COLORS.saffron} />
            ) : (
              <Text style={styles.aiText}>
                AI suggests: {CATEGORIES.find(c => c.key === aiSuggestion?.category)?.label}
                {'  '}
                <Text style={styles.aiConf}>
                  {Math.round((aiSuggestion?.confidence || 0) * 100)}% confidence
                </Text>
              </Text>
            )}
          </View>
        )}

        {/* Category selector */}
        <Text style={styles.label}>Category *</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.key}
              style={[styles.categoryChip, category === cat.key && styles.categoryChipActive]}
              onPress={() => setCategory(cat.key)}
            >
              <Text style={[styles.categoryChipText, category === cat.key && styles.categoryChipTextActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Location */}
        <Text style={styles.label}>Location</Text>
        <View style={styles.locationBox}>
          {location ? (
            <Text style={styles.locationText}>{location.address || 'Location detected'}</Text>
          ) : (
            <Text style={styles.locationPlaceholder}>Detecting your location...</Text>
          )}
        </View>

        {/* Anonymous toggle */}
        <View style={styles.anonymousRow}>
          <View style={styles.anonymousLeft}>
            <Text style={styles.anonymousTitle}>Post anonymously</Text>
            <Text style={styles.anonymousSub}>Your name won't appear publicly</Text>
          </View>
          <Switch
            value={isAnonymous}
            onValueChange={setIsAnonymous}
            trackColor={{ false: '#D3D1C7', true: '#FF9933' }}
            thumbColor="#fff"
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.submitText}>Submit Report</Text>
          }
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          False or misleading reports may result in account action. AI moderation is active.
        </Text>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#F8F7F2' },
  content:      { padding: 16, paddingBottom: 40 },
  label:        { fontSize: 13, fontWeight: '600', color: '#444441', marginBottom: 6, marginTop: 16 },

  mediaBox:    { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D3D1C7', borderStyle: 'dashed', borderRadius: 12, minHeight: 100, alignItems: 'center', justifyContent: 'center', padding: 16 },
  mediaIcon:   { fontSize: 28, color: '#B4B2A9', marginBottom: 4 },
  mediaHint:   { fontSize: 14, color: '#5F5E5A', fontWeight: '500' },
  mediaSubhint:{ fontSize: 12, color: '#B4B2A9', marginTop: 2 },
  mediaRow:    { flexDirection: 'row' },
  mediaThumbnailWrap: { marginRight: 8, position: 'relative' },
  mediaThumbnail: { width: 72, height: 72, borderRadius: 8 },
  mediaRemove:    { position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: '#E24B4A', alignItems: 'center', justifyContent: 'center' },
  mediaRemoveText:{ color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 18 },
  mediaAddMore:   { width: 72, height: 72, borderRadius: 8, borderWidth: 1, borderColor: '#D3D1C7', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  mediaAddMoreText: { fontSize: 24, color: '#B4B2A9' },

  input: { backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#D3D1C7', borderRadius: 10, padding: 12, fontSize: 14, color: '#2C2C2A' },
  textarea: { minHeight: 100, paddingTop: 12 },
  charCount: { fontSize: 11, color: '#B4B2A9', textAlign: 'right', marginTop: 4 },

  aiBox:    { backgroundColor: '#EAF3DE', borderRadius: 8, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  aiText:   { fontSize: 13, color: '#27500A', fontWeight: '500' },
  aiConf:   { color: '#3B6D11', fontWeight: '400' },

  categoryGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#D3D1C7' },
  categoryChipActive:   { backgroundColor: '#FF9933', borderColor: '#FF9933' },
  categoryChipText:     { fontSize: 13, color: '#5F5E5A' },
  categoryChipTextActive:{ color: '#fff', fontWeight: '500' },

  locationBox:        { backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#D3D1C7', borderRadius: 10, padding: 12 },
  locationText:       { fontSize: 13, color: '#2C2C2A' },
  locationPlaceholder:{ fontSize: 13, color: '#B4B2A9' },

  anonymousRow:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 14, marginTop: 16, borderWidth: 0.5, borderColor: '#D3D1C7' },
  anonymousLeft: { flex: 1 },
  anonymousTitle:{ fontSize: 14, fontWeight: '600', color: '#2C2C2A' },
  anonymousSub:  { fontSize: 12, color: '#888780', marginTop: 2 },

  submitBtn:        { backgroundColor: '#FF9933', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled:{ opacity: 0.6 },
  submitText:       { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },
  disclaimer:       { fontSize: 11, color: '#B4B2A9', textAlign: 'center', marginTop: 12, lineHeight: 16 },
});
