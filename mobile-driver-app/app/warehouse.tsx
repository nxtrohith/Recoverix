import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { Search, Building2, MapPin, Navigation } from 'lucide-react-native';
import { useNavigationContext } from '../context/NavigationContext';
import { WarehouseCard } from '../components/WarehouseCard';
import { navigationService } from '../services/navigationService';
import { Warehouse } from '../types/navigation';

export default function WarehouseScreen() {
  const { warehouses, driverLocation, selectedWarehouse, selectWarehouse, startNavigation } =
    useNavigationContext();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredWarehouses = useMemo(() => {
    return warehouses.filter((w) => {
      const matchSearch =
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.city.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;
      if (filterType === 'ALL') return true;
      if (filterType === 'RECOVERY') return w.hubType === 'RECOVERY_CENTER';
      if (filterType === 'PRIMARY') return w.hubType === 'PRIMARY_DC';
      if (filterType === 'REGIONAL') return w.hubType === 'REGIONAL_HUB';
      return true;
    });
  }, [warehouses, search, filterType]);

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Search size={18} color="#64748b" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Telangana warehouses by city or name..."
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filtersRow}>
        {[
          { key: 'ALL', label: 'All (11)' },
          { key: 'PRIMARY', label: 'Primary DCs' },
          { key: 'REGIONAL', label: 'Regional' },
          { key: 'RECOVERY', label: 'Recovery Hub' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterChip, filterType === tab.key && styles.filterChipActive]}
            onPress={() => setFilterType(tab.key)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                filterType === tab.key && styles.filterChipTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Warehouse List */}
      <FlatList
        data={filteredWarehouses}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          const dist = navigationService.getDistanceKm(driverLocation, {
            latitude: item.latitude,
            longitude: item.longitude,
          });
          const isSelected = selectedWarehouse?.id === item.id;

          return (
            <WarehouseCard
              warehouse={item}
              distanceKm={dist}
              isSelected={isSelected}
              onSelect={(w: Warehouse) => {
                selectWarehouse(w);
                startNavigation(w);
              }}
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    color: '#111827',
    fontSize: 13,
    fontWeight: '500',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  filterChipText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
