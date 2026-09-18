import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { AlertTriangle, CheckCircle2, ArrowRight, Package, ShieldCheck, MapPin } from 'lucide-react-native';
import { RecoveryAssignment, Warehouse } from '../types/navigation';

interface RecoveryBannerProps {
  assignment: RecoveryAssignment | null;
  recoveryWarehouse: Warehouse | null;
  destinationWarehouse: Warehouse | null;
  visible: boolean;
  arrivalModalVisible: boolean;
  deliveryCompleteVisible: boolean;
  onAccept: (assignment: RecoveryAssignment) => void;
  onConfirmPickup: () => void;
  onDismiss: () => void;
  onFinishDelivery: () => void;
}

export const RecoveryBanner: React.FC<RecoveryBannerProps> = ({
  assignment,
  recoveryWarehouse,
  destinationWarehouse,
  visible,
  arrivalModalVisible,
  deliveryCompleteVisible,
  onAccept,
  onConfirmPickup,
  onDismiss,
  onFinishDelivery,
}) => {
  if (!assignment) return null;

  return (
    <>
      {/* 1. URGENT RECOVERY DISPATCH MODAL */}
      <Modal visible={visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.alertCard}>
            {/* Header with pulsing alert */}
            <View style={styles.alertHeader}>
              <View style={styles.alertIconPulse}>
                <AlertTriangle size={24} color="#f59e0b" />
              </View>
              <View style={styles.alertHeaderTitle}>
                <Text style={styles.alertCategory}>DISPATCH OVERRIDE</Text>
                <Text style={styles.alertTitle}>RECOVERY ASSIGNMENT</Text>
              </View>
              <View style={styles.priorityBadge}>
                <Text style={styles.priorityText}>{assignment.priority}</Text>
              </View>
            </View>

            {/* Shipment & Cargo Info */}
            <View style={styles.infoBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Shipment ID</Text>
                <Text style={styles.infoValHighlight}>{assignment.shipmentId}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Cargo</Text>
                <Text style={styles.infoVal}>{assignment.units} units · High Value</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Reason</Text>
                <Text style={styles.infoValReason}>{assignment.reason}</Text>
              </View>
            </View>

            {/* Routing Steps */}
            <View style={styles.routeWorkflowBox}>
              {/* Step 1: Recovery Hub */}
              <View style={styles.routeStep}>
                <View style={[styles.stepDot, styles.dotAmber]} />
                <View style={styles.stepContent}>
                  <Text style={styles.stepLabel}>STEP 1: RECOVERY PICKUP</Text>
                  <Text style={styles.stepName}>
                    {recoveryWarehouse?.name || 'Hyderabad North Hub'}
                  </Text>
                  <Text style={styles.stepCity}>
                    {recoveryWarehouse?.city || 'Medchal Corridor'}
                  </Text>
                </View>
              </View>

              <View style={styles.stepConnector} />

              {/* Step 2: Final Destination */}
              <View style={styles.routeStep}>
                <View style={[styles.stepDot, styles.dotGreen]} />
                <View style={styles.stepContent}>
                  <Text style={styles.stepLabel}>STEP 2: FINAL DELIVERY</Text>
                  <Text style={styles.stepName}>
                    {destinationWarehouse?.name || 'Warangal Regional Depot'}
                  </Text>
                  <Text style={styles.stepCity}>
                    {destinationWarehouse?.city || 'Warangal'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.btnRow}>
              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={onDismiss}
                activeOpacity={0.7}
              >
                <Text style={styles.dismissBtnText}>LATER</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => onAccept(assignment)}
                activeOpacity={0.85}
              >
                <ShieldCheck size={18} color="#ffffff" />
                <Text style={styles.acceptBtnText}>ACCEPT RECOVERY</Text>
                <ArrowRight size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. ARRIVED AT RECOVERY WAREHOUSE MODAL */}
      <Modal visible={arrivalModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.alertCard, styles.arrivalCard]}>
            <View style={styles.arrivalIconCenter}>
              <CheckCircle2 size={42} color="#f59e0b" />
            </View>

            <Text style={styles.arrivalTitle}>ARRIVED AT RECOVERY HUB</Text>
            <Text style={styles.arrivalSubtitle}>
              {recoveryWarehouse?.name || 'Hyderabad North Logistics Center'}
            </Text>

            <View style={styles.pickupDetailBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Shipment</Text>
                <Text style={styles.infoValHighlight}>{assignment.shipmentId}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Required Cargo</Text>
                <Text style={styles.infoValHighlight}>{assignment.units} Units</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Next Delivery</Text>
                <Text style={styles.infoVal}>{destinationWarehouse?.name || 'Warangal Depot'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.confirmPickupBtn}
              onPress={onConfirmPickup}
              activeOpacity={0.85}
            >
              <Package size={20} color="#ffffff" />
              <Text style={styles.confirmPickupText}>CONFIRM PICKUP & LOAD</Text>
              <ArrowRight size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. FINAL DELIVERY COMPLETE CELEBRATION MODAL */}
      <Modal visible={deliveryCompleteVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.alertCard, styles.completeCard]}>
            <View style={styles.completeIconCenter}>
              <ShieldCheck size={48} color="#10b981" />
            </View>

            <Text style={styles.completeTitle}>MISSION COMPLETED</Text>
            <Text style={styles.completeSubtitle}>
              Recovery Consignment Successfully Delivered!
            </Text>

            <View style={styles.completeDetailBox}>
              <Text style={styles.completeDetailText}>
                Shipment <Text style={{ fontWeight: '800', color: '#10b981' }}>{assignment.shipmentId}</Text> ({assignment.units} units) has been inspected and checked into {destinationWarehouse?.name}.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.finishDeliveryBtn}
              onPress={onFinishDelivery}
              activeOpacity={0.85}
            >
              <Text style={styles.finishDeliveryText}>RETURN TO STANDBY</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  alertCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#f59e0b',
    padding: 20,
    shadowColor: '#f59e0b',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  arrivalCard: {
    borderColor: '#f59e0b',
    alignItems: 'center',
  },
  completeCard: {
    borderColor: '#10b981',
    shadowColor: '#10b981',
    alignItems: 'center',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  alertIconPulse: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertHeaderTitle: {
    flex: 1,
  },
  alertCategory: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#f59e0b',
    letterSpacing: 0.8,
  },
  alertTitle: {
    fontSize: 17,
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
    letterSpacing: 0.5,
  },
  infoBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  infoLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  infoVal: {
    fontSize: 12,
    color: '#e2e8f0',
    fontWeight: '700',
  },
  infoValHighlight: {
    fontSize: 13,
    color: '#38bdf8',
    fontWeight: '800',
  },
  infoValReason: {
    fontSize: 11,
    color: '#fbbf24',
    maxWidth: '65%',
    textAlign: 'right',
  },
  routeWorkflowBox: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  routeStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 12,
  },
  dotAmber: {
    backgroundColor: '#f59e0b',
    borderWidth: 2,
    borderColor: '#fef3c7',
  },
  dotGreen: {
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: '#d1fae5',
  },
  stepConnector: {
    width: 2,
    height: 20,
    backgroundColor: '#475569',
    marginLeft: 6,
    marginVertical: 2,
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  stepName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#f8fafc',
  },
  stepCity: {
    fontSize: 11,
    color: '#64748b',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dismissBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  dismissBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '800',
  },
  acceptBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#d97706',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#d97706',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  acceptBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  arrivalIconCenter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 2,
    borderColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  arrivalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  arrivalSubtitle: {
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickupDetailBox: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  confirmPickupBtn: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#10b981',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  confirmPickupText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  completeIconCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderWidth: 2,
    borderColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  completeTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  completeSubtitle: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  completeDetailBox: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  completeDetailText: {
    fontSize: 13,
    color: '#cbd5e1',
    lineHeight: 19,
    textAlign: 'center',
  },
  finishDeliveryBtn: {
    width: '100%',
    backgroundColor: '#0284c7',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishDeliveryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
});
