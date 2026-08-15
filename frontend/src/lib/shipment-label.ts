export const SHIPMENT_LABEL_SIZES = ['a4', 'thermal-80x100', 'thermal-100x150'] as const;
export type ShipmentLabelSize = (typeof SHIPMENT_LABEL_SIZES)[number];

export interface ShipmentLabelOptions {
  size: ShipmentLabelSize;
  showSenderPhone: boolean;
  showRecipientPhone: boolean;
  maskRecipientName: boolean;
  maskRecipientPhone: boolean;
  showShippingCost: boolean;
  showInsurance: boolean;
  showItems: boolean;
  showItemDescriptions: boolean;
  showItemSkus: boolean;
}

export interface ShipmentLabelFile {
  fileName: string;
  contentType: 'application/pdf';
  base64: string;
  size: ShipmentLabelSize;
  waybillId: string;
}

export const DEFAULT_SHIPMENT_LABEL_OPTIONS: ShipmentLabelOptions = {
  size: 'thermal-100x150',
  showSenderPhone: true,
  showRecipientPhone: true,
  maskRecipientName: true,
  maskRecipientPhone: true,
  showShippingCost: true,
  showInsurance: true,
  showItems: true,
  showItemDescriptions: true,
  showItemSkus: true,
};

export function shipmentLabelQuery(options: ShipmentLabelOptions): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) params.set(key, String(value));
  return params.toString();
}

export function shipmentLabelBlobUrl(file: ShipmentLabelFile): string {
  const binary = atob(file.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: file.contentType }));
}
