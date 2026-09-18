import React, { useState } from 'react';
import { View, StyleSheet, Modal, Text, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Search } from 'lucide-react-native';
import { useNavigationContext } from '../context/NavigationContext';
import { MapView } from '../components/MapView';
import { NavigationHeader } from '../components/NavigationHeader';
import { NavigationBottomSheet } from '../components/NavigationBottomSheet';
import { RecoveryBanner } from '../components/RecoveryBanner';
import { SimulationControls } from '../components/SimulationControls';
import { WarehouseCard } from '../components/WarehouseCard';
import { navigationService } from '../services/navigationService';

export default function IndexScreen() {
  const {
    driver,
    driverLocation,
    warehouses,
    mode,
    selectedWarehouse,
    destinationWarehouse,
    recoveryWarehouse,
    activeRoute,
    recoveryAssignment,
    guidanceState,
    isVoiceMuted,
    isRerouting,
    toggleVoiceMute,
    isSimulating,
    isSimPaused,
    simSpeed,
    simProgress,
    recoveryAlertVisible,
    arrivalModalVisible,
    deliveryCompleteVisible,
    selectWarehouse,
    startNavigation,
    stopNavigation,
    triggerRecoveryAlert,
    acceptRecovery,
    confirmPickup,
    finishDelivery,
    dismissRecoveryAlert,
    startSimulation,
    pauseSimulation,
    resumeSimulation,
    resetSimulation,
    setSimulationSpeed,
    toggleSimulationMode,
    recenterMap,
    isNavigatorFollowing,
    toggleNavigatorFollowing,
    launchExternalNavigation,
  } = useNavigationContext();

  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [showSimDock, setShowSimDock] = useState(true);

  const remainingDist = activeRoute ? activeRoute.distanceKm : 0;
  const fallbackManeuverText = activeRoute
    ? navigationService.getNextManeuver(activeRoute, remainingDist)
    : 'Select warehouse to calculate optimal corridor';

  const activeManeuverText =
    guidanceState.currentManeuver?.instruction || fallbackManeuverText;

  return (
    <View style={styles.container}>
      {/* 1. Full-screen Tactical Map with Navigator Follow */}
      <MapView
        driverLocation={driverLocation}
        warehouses={warehouses}
        selectedWarehouse={selectedWarehouse}
        destinationWarehouse={destinationWarehouse}
        recoveryWarehouse={recoveryWarehouse}
        activeRoute={activeRoute}
        recoveryAssignment={recoveryAssignment}
        isSimulating={isSimulating}
        isNavigatorMode={isNavigatorFollowing}
        currentManeuver={guidanceState.currentManeuver}
        isVoiceMuted={isVoiceMuted}
        onSelectWarehouse={(w) => {
          selectWarehouse(w);
        }}
        onRecenter={recenterMap}
        onToggleNavigatorMode={toggleNavigatorFollowing}
        onToggleVoiceMute={toggleVoiceMute}
      />

      {/* 2. Top Tactical Header */}
      <NavigationHeader
        driver={driver}
        isSimulating={isSimulating}
        hasActiveRecovery={
          mode === 'RECOVERY_LEG_1' || mode === 'AT_RECOVERY' || mode === 'RECOVERY_LEG_2'
        }
        onTriggerRecovery={triggerRecoveryAlert}
        onOpenWarehouseList={() => setWarehouseModalOpen(true)}
        onToggleSimulation={() => {
          toggleSimulationMode();
          setShowSimDock(true);
        }}
      />

      {/* 3. Floating Simulation Control Dock (when simulation is active or in use) */}
      {(isSimulating || showSimDock) && (
        <SimulationControls
          isSimulating={isSimulating}
          isPaused={isSimPaused}
          speed={simSpeed}
          progressPercent={simProgress}
          onStart={startSimulation}
          onPause={pauseSimulation}
          onResume={resumeSimulation}
          onReset={resetSimulation}
          onSetSpeed={setSimulationSpeed}
        />
      )}

      {/* 4. Navigation Bottom Sheet / Card with Google Maps Launch */}
      <NavigationBottomSheet
        mode={mode}
        destination={destinationWarehouse}
        activeRoute={activeRoute}
        recoveryAssignment={recoveryAssignment}
        currentManeuverText={activeManeuverText}
        distanceToNextManeuverMeters={guidanceState.distanceToNextManeuverMeters}
        nextManeuverText={guidanceState.nextManeuver?.instruction}
        isRerouting={isRerouting}
        isVoiceMuted={isVoiceMuted}
        onStartNavigation={() => startNavigation()}
        onStopNavigation={stopNavigation}
        onOpenWarehouseSelector={() => setWarehouseModalOpen(true)}
        onLaunchExternalGoogleMaps={launchExternalNavigation}
        onToggleVoiceMute={toggleVoiceMute}
      />

      {/* 5. Urgent Recovery Alert Modals & Arrival Confirmations */}
      <RecoveryBanner
        assignment={recoveryAssignment}
        recoveryWarehouse={recoveryWarehouse}
        destinationWarehouse={destinationWarehouse}
        visible={recoveryAlertVisible}
        arrivalModalVisible={arrivalModalVisible}
        deliveryCompleteVisible={deliveryCompleteVisible}
        onAccept={acceptRecovery}
        onConfirmPickup={confirmPickup}
        onDismiss={dismissRecoveryAlert}
        onFinishDelivery={finishDelivery}
      />

      {/* 6. Warehouse Picker Modal */}
      <Modal visible={warehouseModalOpen} animationType="slide" transparent>
        <SafeAreaView style={styles.modalBg}>
          <View style={styles.pickerHeader}>
            <View>
              <Text style={styles.pickerCategory}>TELANGANA LOGISTICS NETWORK</Text>
              <Text style={styles.pickerTitle}>Select Destination Hub</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setWarehouseModalOpen(false)}
            >
              <X size={18} color="#111827" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={warehouses}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
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
                  onSelect={(w) => {
                    selectWarehouse(w);
                    setWarehouseModalOpen(false);
                  }}
                />
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalBg: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  pickerCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.6,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 9999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 14,
    paddingBottom: 40,
  },
});
