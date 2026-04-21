import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, TextInput, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useIssues } from '../hooks/useIssues';
import { CATEGORIES, STATUS_COLORS, COLORS } from '../constants/theme';

const CATEGORY_FILTERS = [
  { key: null,         label: 'All' },
  { key: 'roads',      label: 'Roads' },
  { key: 'power',      label: 'Power' },
  { key: 'water',      label: 'Water' },
  { key: 'sanitation', label: 'Civic' },
  { key: 'police',     label: 'Police' },
  { key: 'corruption', label: 'Corruption' },
];

export default function HomeFeedScreen() {
  const navigation = useNavigation();
  const [activeCategory, setActiveCategory] = useState(null);
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'popular' | 'trending'

  const {
    issues, loading, refreshing,
    fetchMore, refresh, hasMore,
  } = useIssues({ category: activeCategory, sort: sortBy });

  const renderIssueCard = useCallback(({ item: issue }) => (
    <IssueCard
      issue={issue}
      onPress={() => navigation.navigate('IssueDetail', { issueId: issue._id })}
    />
  ), [navigation]);

  const renderHeader = () => (
    <View>
      {/* Category filter row */}
      <FlatList
        horizontal
        data={CATEGORY_FILTERS}
        keyExtractor={i => String(i.key)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, activeCategory === item.key && styles.filterChipActive]}
            onPress={() => setActiveCategory(item.key)}
          >
            <Text style={[
              styles.filterLabel,
              activeCategory === item.key && styles.filterLabelActive,
            ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Sort row */}
      <View style={styles.sortRow}>
        {['recent', 'popular', 'trending'].map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]}
            onPress={() => setSortBy(s)}
          >
            <Text style={[styles.sortLabel, sortBy === s && styles.sortLabelActive]}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={COLORS.saffron} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={issues}
        keyExtractor={item => item._id}
        renderItem={renderIssueCard}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={!loading ? <EmptyState category={activeCategory} /> : null}
        onEndReached={fetchMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={COLORS.saffron}
          />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ─── Issue Card Component ─────────────────────────────────────────────────────

function IssueCard({ issue, onPress }) {
  const statusColor = STATUS_COLORS[issue.status] || STATUS_COLORS.pending;
  const categoryInfo = CATEGORIES[issue.category] || CATEGORIES.other;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Category + Status */}
      <View style={styles.cardTopRow}>
        <View style={[styles.categoryBadge, { backgroundColor: categoryInfo.bg }]}>
          <Text style={[styles.categoryText, { color: categoryInfo.color }]}>
            {categoryInfo.label}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusText, { color: statusColor.text }]}>
            {issue.status.replace('_', ' ')}
          </Text>
        </View>
      </View>

      {/* Title */}
      <Text style={styles.cardTitle} numberOfLines={2}>
        {issue.title}
      </Text>

      {/* Location */}
      {issue.location?.address && (
        <Text style={styles.cardLocation} numberOfLines={1}>
          {issue.location.address}
        </Text>
      )}

      {/* Footer: votes, comments, time */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>
          ▲ {issue.upvote_count}  ·  {issue.comment_count} comments
        </Text>
        {issue.is_trending && (
          <View style={styles.trendingBadge}>
            <Text style={styles.trendingText}>Trending</Text>
          </View>
        )}
        <Text style={styles.cardTime}>
          {formatTime(issue.createdAt)}
        </Text>
      </View>

      {/* Official response indicator */}
      {issue.assigned_official && (
        <View style={styles.officialBanner}>
          <Text style={styles.officialText}>
            Official responded · {issue.assigned_official.department || 'Govt. Dept.'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ category }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>No issues found</Text>
      <Text style={styles.emptySubtitle}>
        {category
          ? `No ${category} issues in your area yet.`
          : 'Be the first to report a civic issue.'}
      </Text>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#F8F7F2' },
  list:          { paddingBottom: 24 },
  filterRow:     { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip:    { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#EBEBEB', borderWidth: 0.5, borderColor: '#D3D1C7' },
  filterChipActive: { backgroundColor: '#FF9933', borderColor: '#FF9933' },
  filterLabel:   { fontSize: 13, color: '#5F5E5A', fontWeight: '500' },
  filterLabelActive: { color: '#fff' },
  sortRow:       { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  sortBtn:       { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: 'transparent' },
  sortBtnActive: { backgroundColor: '#FFF3E0' },
  sortLabel:     { fontSize: 13, color: '#888780' },
  sortLabelActive:{ color: '#E65100', fontWeight: '500' },

  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 0.5,
    borderColor: '#D3D1C7',
  },
  cardTopRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  categoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  categoryText:  { fontSize: 11, fontWeight: '600' },
  statusPill:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText:    { fontSize: 10, fontWeight: '500' },
  cardTitle:     { fontSize: 15, fontWeight: '600', color: '#2C2C2A', lineHeight: 21, marginBottom: 4 },
  cardLocation:  { fontSize: 12, color: '#888780', marginBottom: 8 },
  cardFooter:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardMeta:      { fontSize: 12, color: '#888780', flex: 1 },
  cardTime:      { fontSize: 12, color: '#B4B2A9' },
  trendingBadge: { backgroundColor: '#FFF3E0', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  trendingText:  { fontSize: 10, color: '#E65100', fontWeight: '600' },
  officialBanner:{ marginTop: 10, backgroundColor: '#E6F1FB', borderRadius: 6, padding: 6, borderLeftWidth: 2, borderLeftColor: '#378ADD' },
  officialText:  { fontSize: 11, color: '#0C447C', fontWeight: '500' },
  footerLoader:  { padding: 20, alignItems: 'center' },
  emptyState:    { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyTitle:    { fontSize: 18, fontWeight: '600', color: '#2C2C2A', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#888780', textAlign: 'center', lineHeight: 20 },
});
