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
    backgroundColor: '#090d16',
    padding: 14,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 13,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  filterChipText: {
    fontSize: 10.5,
    color: '#94a3b8',
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
});
