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
                <AlertTriangle size={22} color="#B45309" />
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
                <ShieldCheck size={18} color="#FFFFFF" />
                <Text style={styles.acceptBtnText}>ACCEPT RECOVERY</Text>
                <ArrowRight size={18} color="#FFFFFF" />
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
              <CheckCircle2 size={32} color="#15803D" />
            </View>

            <Text style={styles.arrivalTitle}>ARRIVED AT RECOVERY HUB</Text>
            <Text style={styles.arrivalSubtitle}>
              {recoveryWarehouse?.name || 'Hyderabad North Logistics Center'}
            </Text>

            <View style={styles.pickupDetailBox}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Cargo Units</Text>
                <Text style={styles.infoVal}>{assignment.units} units</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Handling Code</Text>
                <Text style={styles.infoValHighlight}>VAL-04 (Fragile / Sealed)</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.confirmPickupBtn}
              onPress={onConfirmPickup}
              activeOpacity={0.85}
            >
              <Package size={17} color="#FFFFFF" />
              <Text style={styles.confirmPickupText}>CONFIRM CARGO PICKUP</Text>
              <ArrowRight size={17} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. RECOVERY DELIVERY COMPLETED MODAL */}
      <Modal visible={deliveryCompleteVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.alertCard, styles.completeCard]}>
            <View style={styles.completeIconCenter}>
              <CheckCircle2 size={32} color="#15803D" />
            </View>

            <Text style={styles.completeTitle}>RECOVERY DELIVERY COMPLETE</Text>
            <Text style={styles.completeSubtitle}>
              Delivered safely to {destinationWarehouse?.name || 'Warangal Regional Depot'}
            </Text>

            <View style={styles.completeDetailBox}>
              <Text style={styles.completeDetailText}>
                All {assignment.units} units successfully handed over to destination terminal staff.
                Fleet dispatch has logged mission completion.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.finishDeliveryBtn}
              onPress={onFinishDelivery}
              activeOpacity={0.85}
            >
              <Text style={styles.finishDeliveryText}>RETURN TO COCKPIT</Text>
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
    backgroundColor: 'rgba(17, 24, 39, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  alertCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  arrivalCard: {
    alignItems: 'center',
  },
  completeCard: {
    alignItems: 'center',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  alertIconPulse: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  alertHeaderTitle: {
    flex: 1,
  },
  alertCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.6,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.2,
  },
  priorityBadge: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  priorityText: {
    color: '#B91C1C',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  infoBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 12,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  infoLabel: {
    fontSize: 11.5,
    color: '#6B7280',
    fontWeight: '600',
  },
  infoVal: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  infoValHighlight: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '800',
  },
  infoValReason: {
    fontSize: 11.5,
    color: '#B45309',
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  routeWorkflowBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 16,
  },
  routeStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  dotAmber: {
    backgroundColor: '#B45309',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  dotGreen: {
    backgroundColor: '#15803D',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  stepConnector: {
    width: 2,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginLeft: 5,
    marginVertical: 2,
  },
  stepContent: {
    flex: 1,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  stepName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  stepCity: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dismissBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 13,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dismissBtnText: {
    color: '#111827',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  acceptBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  arrivalIconCenter: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  arrivalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  arrivalSubtitle: {
    fontSize: 12.5,
    color: '#15803D',
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  pickupDetailBox: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  confirmPickupBtn: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmPickupText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  completeIconCenter: {
    width: 56,
    height: 56,
    borderRadius: 9999,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  completeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  completeSubtitle: {
    fontSize: 12.5,
    color: '#15803D',
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  completeDetailBox: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 16,
  },
  completeDetailText: {
    fontSize: 12.5,
    color: '#4B5563',
    lineHeight: 18,
    textAlign: 'center',
  },
  finishDeliveryBtn: {
    width: '100%',
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishDeliveryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
