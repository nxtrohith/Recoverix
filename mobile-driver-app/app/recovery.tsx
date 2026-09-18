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
        <ShieldAlert size={28} color="#f59e0b" />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerCategory}>URGENT DISPATCH MISSION</Text>
          <Text style={styles.bannerTitle}>Shipment Recovery Control</Text>
        </View>
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityText}>HIGH</Text>
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
          <Text style={[styles.statusText, isLeg2 && { color: '#10b981' }]}>
            {mode}
          </Text>
        </View>
      </View>

      {/* 3. Multi-Step Journey Tracker */}
      <Text style={styles.sectionTitle}>RECOVERY ROUTE TIMELINE</Text>

      <View style={styles.timelineCard}>
        {/* Step 1 */}
        <View style={styles.timelineStep}>
          <View style={[styles.stepIcon, (isLeg1 || isAtRecovery || isLeg2 || isDelivered) && styles.stepDone]}>
            <Truck size={14} color="#ffffff" />
          </View>
          <View style={styles.stepInfo}>
            <Text style={styles.stepTitle}>Leg 1: Transit to Recovery Hub</Text>
            <Text style={styles.stepLoc}>
              {recoveryWarehouse?.name || 'Hyderabad North Hub (Medchal)'}
            </Text>
            <Text style={styles.stepStatus}>
              {isLeg1 ? '● EN ROUTE NOW' : isAtRecovery ? '✓ ARRIVED AT HUB' : isLeg2 || isDelivered ? '✓ COMPLETED' : 'PENDING'}
            </Text>
          </View>
        </View>

        <View style={styles.stepLine} />

        {/* Step 2 */}
        <View style={styles.timelineStep}>
          <View style={[styles.stepIcon, (isAtRecovery || isLeg2 || isDelivered) && styles.stepDone]}>
            <Package size={14} color="#ffffff" />
          </View>
          <View style={styles.stepInfo}>
            <Text style={styles.stepTitle}>Cargo Loading & Inspection</Text>
            <Text style={styles.stepLoc}>Transfer 500 units into TRK-218 cargo container</Text>
            <Text style={styles.stepStatus}>
              {isAtRecovery ? '● READY FOR PICKUP CONFIRMATION' : isLeg2 || isDelivered ? '✓ LOADED & SEALED' : 'AWAITING ARRIVAL'}
            </Text>
          </View>
        </View>

        <View style={styles.stepLine} />

        {/* Step 3 */}
        <View style={styles.timelineStep}>
          <View style={[styles.stepIcon, isDelivered && styles.stepDone]}>
            <CheckCircle2 size={14} color="#ffffff" />
          </View>
          <View style={styles.stepInfo}>
            <Text style={styles.stepTitle}>Leg 2: Final Destination Delivery</Text>
            <Text style={styles.stepLoc}>
              {destinationWarehouse?.name || 'Warangal Regional Depot'}
            </Text>
            <Text style={styles.stepStatus}>
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
            <ShieldAlert size={18} color="#ffffff" />
            <Text style={styles.actionBtnText}>DISPATCH RECOVERY EVENT</Text>
          </TouchableOpacity>
        ) : isLeg1 ? (
          <TouchableOpacity
            style={styles.confirmArrivalBtn}
            onPress={confirmPickup}
            activeOpacity={0.85}
          >
            <Package size={18} color="#ffffff" />
            <Text style={styles.actionBtnText}>SIMULATE ARRIVAL & PICKUP</Text>
          </TouchableOpacity>
        ) : isAtRecovery ? (
          <TouchableOpacity
            style={styles.confirmArrivalBtn}
            onPress={confirmPickup}
            activeOpacity={0.85}
          >
            <Package size={18} color="#ffffff" />
            <Text style={styles.actionBtnText}>CONFIRM CARGO PICKUP</Text>
          </TouchableOpacity>
        ) : isLeg2 ? (
          <TouchableOpacity
            style={styles.finishBtn}
            onPress={finishDelivery}
            activeOpacity={0.85}
          >
            <CheckCircle2 size={18} color="#ffffff" />
            <Text style={styles.actionBtnText}>COMPLETE FINAL DELIVERY</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={triggerRecoveryAlert}
            activeOpacity={0.85}
          >
            <RotateCcw size={18} color="#ffffff" />
            <Text style={styles.actionBtnText}>START NEW RECOVERY SIMULATION</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    padding: 14,
    gap: 12,
    marginBottom: 14,
  },
  bannerCategory: {
    fontSize: 9,
    fontWeight: '800',
    color: '#f59e0b',
    letterSpacing: 0.8,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ffffff',
  },
  priorityBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  specCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 18,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  specLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  specValue: {
    fontSize: 12.5,
    color: '#f8fafc',
    fontWeight: '700',
  },
  specValueHighlight: {
    fontSize: 14,
    color: '#38bdf8',
    fontWeight: '800',
  },
  specValueReason: {
    fontSize: 11.5,
    color: '#fbbf24',
    maxWidth: '60%',
    textAlign: 'right',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f59e0b',
  },
  divider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 4,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  timelineCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    marginBottom: 18,
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepDone: {
    backgroundColor: '#0284c7',
  },
  stepInfo: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f8fafc',
  },
  stepLoc: {
    fontSize: 11.5,
    color: '#94a3b8',
    marginTop: 2,
  },
  stepStatus: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    marginTop: 3,
  },
  stepLine: {
    width: 2,
    height: 24,
    backgroundColor: '#334155',
    marginLeft: 15,
    marginVertical: 4,
  },
  actionsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  triggerBtn: {
    flexDirection: 'row',
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmArrivalBtn: {
    flexDirection: 'row',
    backgroundColor: '#f59e0b',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  finishBtn: {
    flexDirection: 'row',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  resetBtn: {
    flexDirection: 'row',
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
