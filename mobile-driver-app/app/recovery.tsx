import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { ShieldAlert, Package, CheckCircle2, ArrowRight, Truck, MapPin, RotateCcw } from 'lucide-react-native';
import { useNavigationContext } from '../context/NavigationContext';

export default function RecoveryScreen() {
  const {
    recoveryAssignment,
    recoveryWarehouse,
    destinationWarehouse,
    mode,
    triggerRecoveryAlert,
    acceptRecovery,
    confirmPickup,
    finishDelivery,
  } = useNavigationContext();

  const isLeg1 = mode === 'RECOVERY_LEG_1';
  const isAtRecovery = mode === 'AT_RECOVERY';
  const isLeg2 = mode === 'RECOVERY_LEG_2';
  const isDelivered = mode === 'DELIVERED';

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      {/* 1. Header Banner */}
      <View style={styles.bannerHeader}>
        <View style={styles.bannerIconBox}>
          <ShieldAlert size={22} color="#B45309" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerCategory}>DISPATCH OVERRIDE</Text>
          <Text style={styles.bannerTitle}>Shipment Recovery Mission</Text>
        </View>
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityText}>HIGH PRIORITY</Text>
        </View>
      </View>

      {/* 2. Shipment Specifications */}
      <View style={styles.specCard}>
        <View style={styles.specRow}>
          <Text style={styles.specLabel}>Shipment ID</Text>
          <Text style={styles.specValueHighlight}>
            {recoveryAssignment?.shipmentId || 'SH-1047'}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.specRow}>
          <Text style={styles.specLabel}>Consignment</Text>
          <Text style={styles.specValue}>{recoveryAssignment?.units || 500} Units (High-Value Cargo)</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.specRow}>
          <Text style={styles.specLabel}>Incident Reason</Text>
          <Text style={styles.specValueReason}>
            {recoveryAssignment?.reason || 'Primary vehicle breakdown; urgent reroute required.'}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.specRow}>
          <Text style={styles.specLabel}>Status</Text>
          <View style={[styles.statusBadge, isLeg2 ? styles.statusBadgeGreen : styles.statusBadgeAmber]}>
            <Text style={[styles.statusText, isLeg2 ? styles.statusTextGreen : styles.statusTextAmber]}>
              {mode}
            </Text>
          </View>
        </View>
      </View>

      {/* 3. Multi-Step Journey Tracker */}
      <Text style={styles.sectionTitle}>RECOVERY ROUTE TIMELINE</Text>

      <View style={styles.timelineCard}>
        {/* Step 1 */}
        <View style={styles.timelineStep}>
          <View style={[styles.stepIcon, (isLeg1 || isAtRecovery || isLeg2 || isDelivered) ? styles.stepDone : styles.stepInactive]}>
            <Truck size={15} color={(isLeg1 || isAtRecovery || isLeg2 || isDelivered) ? "#FFFFFF" : "#6B7280"} />
          </View>
          <View style={styles.stepInfo}>
            <Text style={styles.stepTitle}>Leg 1: Transit to Recovery Hub</Text>
            <Text style={styles.stepLoc}>
              {recoveryWarehouse?.name || 'Hyderabad North Hub (Medchal)'}
            </Text>
            <Text style={[styles.stepStatus, (isLeg1 || isAtRecovery) ? styles.stepStatusAmber : (isLeg2 || isDelivered) ? styles.stepStatusGreen : styles.stepStatusMuted]}>
              {isLeg1 ? '● EN ROUTE NOW' : isAtRecovery ? '✓ ARRIVED AT HUB' : isLeg2 || isDelivered ? '✓ COMPLETED' : 'PENDING'}
            </Text>
          </View>
        </View>

        <View style={styles.stepLine} />

        {/* Step 2 */}
        <View style={styles.timelineStep}>
          <View style={[styles.stepIcon, (isAtRecovery || isLeg2 || isDelivered) ? styles.stepDone : styles.stepInactive]}>
            <Package size={15} color={(isAtRecovery || isLeg2 || isDelivered) ? "#FFFFFF" : "#6B7280"} />
          </View>
          <View style={styles.stepInfo}>
            <Text style={styles.stepTitle}>Cargo Loading & Inspection</Text>
            <Text style={styles.stepLoc}>Transfer 500 units into TRK-218 cargo container</Text>
            <Text style={[styles.stepStatus, isAtRecovery ? styles.stepStatusAmber : (isLeg2 || isDelivered) ? styles.stepStatusGreen : styles.stepStatusMuted]}>
              {isAtRecovery ? '● READY FOR PICKUP CONFIRMATION' : isLeg2 || isDelivered ? '✓ LOADED & SEALED' : 'AWAITING ARRIVAL'}
            </Text>
          </View>
        </View>

        <View style={styles.stepLine} />

        {/* Step 3 */}
        <View style={styles.timelineStep}>
          <View style={[styles.stepIcon, isDelivered ? styles.stepDone : styles.stepInactive]}>
            <CheckCircle2 size={15} color={isDelivered ? "#FFFFFF" : "#6B7280"} />
          </View>
          <View style={styles.stepInfo}>
            <Text style={styles.stepTitle}>Leg 2: Final Destination Delivery</Text>
            <Text style={styles.stepLoc}>
              {destinationWarehouse?.name || 'Warangal Regional Depot'}
            </Text>
            <Text style={[styles.stepStatus, isLeg2 ? styles.stepStatusAmber : isDelivered ? styles.stepStatusGreen : styles.stepStatusMuted]}>
              {isLeg2 ? '● EN ROUTE TO FINAL DESTINATION' : isDelivered ? '✓ DELIVERED & SIGNED OFF' : 'PENDING PICKUP'}
            </Text>
          </View>
        </View>
      </View>

      {/* 4. Action Buttons for Testing Workflow */}
      <View style={styles.actionsContainer}>
        {mode === 'IDLE' || mode === 'NAVIGATING' ? (
          <TouchableOpacity
            style={styles.triggerBtn}
            onPress={triggerRecoveryAlert}
            activeOpacity={0.85}
          >
            <ShieldAlert size={18} color="#FFFFFF" />
            <Text style={styles.triggerBtnText}>TRIGGER RECOVERY ALERT</Text>
          </TouchableOpacity>
        ) : isLeg1 ? (
          <TouchableOpacity
            style={styles.confirmArrivalBtn}
            onPress={confirmPickup}
            activeOpacity={0.85}
          >
            <Package size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>SIMULATE ARRIVAL & PICKUP</Text>
          </TouchableOpacity>
        ) : isAtRecovery ? (
          <TouchableOpacity
            style={styles.confirmArrivalBtn}
            onPress={confirmPickup}
            activeOpacity={0.85}
          >
            <Package size={18} color="#FFFFFF" />
            <Text style={styles.actionBtnText}>CONFIRM CARGO PICKUP</Text>
          </TouchableOpacity>
        ) : isLeg2 ? (
          <TouchableOpacity
            style={styles.finishBtn}
            onPress={finishDelivery}
            activeOpacity={0.85}
          >
            <CheckCircle2 size={18} color="#FFFFFF" />
            <Text style={styles.finishBtnText}>COMPLETE FINAL DELIVERY</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={triggerRecoveryAlert}
            activeOpacity={0.85}
          >
            <RotateCcw size={18} color="#111827" />
            <Text style={styles.resetBtnText}>START NEW RECOVERY SIMULATION</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bannerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
    letterSpacing: 0.8,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  priorityBadge: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  priorityText: {
    color: '#B91C1C',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  specCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  specLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  specValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  specValueHighlight: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  specValueReason: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  statusBadgeGreen: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  statusBadgeAmber: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusTextGreen: {
    color: '#15803D',
  },
  statusTextAmber: {
    color: '#B45309',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepInactive: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stepDone: {
    backgroundColor: '#111827',
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  stepLoc: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
  },
  stepStatus: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: 0.4,
  },
  stepStatusGreen: {
    color: '#15803D',
  },
  stepStatusAmber: {
    color: '#B45309',
  },
  stepStatusMuted: {
    color: '#9CA3AF',
  },
  stepLine: {
    width: 2,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginLeft: 15,
    marginVertical: 2,
  },
  actionsContainer: {
    gap: 10,
    marginBottom: 24,
  },
  triggerBtn: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  triggerBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  confirmArrivalBtn: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  finishBtn: {
    flexDirection: 'row',
    backgroundColor: '#15803D',
    paddingVertical: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resetBtn: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 14,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  resetBtnText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
