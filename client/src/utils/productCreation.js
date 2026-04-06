import { getISTDateString } from './dateUtils';

export const UNIT_OPTIONS = [
  { value: 'kg', label: 'kg' },
  { value: 'grams', label: 'grams' },
  { value: 'packet', label: 'packet' },
  { value: 'bag', label: 'bag' },
  { value: 'liters', label: 'liters' },
  { value: 'ml', label: 'ml' },
  { value: 'pieces', label: 'pieces' },
  { value: 'bottles', label: 'bottles' },
  { value: 'tonnes', label: 'tonnes' }
];

export const GST_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '12', label: '12%' },
  { value: '18', label: '18%' },
  { value: '28', label: '28%' }
];

export const PRODUCT_CREATION_MODE = {
  INVENTORY: 'inventory',
  ORDER: 'order'
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getEmptyProductCreationForm = ({
  defaultCategory = '',
  defaultBankAccountId = ''
} = {}) => ({
  product_id: '',
  category: defaultCategory,
  product_name: '',
  variety: '',
  quantity_available: '',
  unit: 'kg',
  purchase_price: '',
  selling_price: '',
  supplier: '',
  gst_percent: '0',
  hsn_code: '',
  reorder_point: '10',
  reorder_quantity: '',
  barcode: '',
  expiry_date: '',
  batch_number: '',
  manufacturing_date: '',
  creation_mode: PRODUCT_CREATION_MODE.INVENTORY,
  order_quantity: '',
  order_date: getISTDateString(),
  advance_amount: '',
  bank_account_id: defaultBankAccountId ? String(defaultBankAccountId) : ''
});

export const validateProductCreationForm = (form) => {
  const creationMode = form.creation_mode || PRODUCT_CREATION_MODE.INVENTORY;
  const inventoryQuantity = toNumber(form.quantity_available);
  const orderQuantity = toNumber(form.order_quantity);
  const advanceAmount = toNumber(form.advance_amount);
  const purchasePrice = toNumber(form.purchase_price);
  const supplierName = String(form.supplier || '').trim();

  if (creationMode === PRODUCT_CREATION_MODE.INVENTORY && inventoryQuantity <= 0) {
    return 'Enter stock quantity when adding the new product directly to inventory';
  }

  if (creationMode === PRODUCT_CREATION_MODE.ORDER && orderQuantity <= 0) {
    return 'Enter order quantity when creating a pending order';
  }

  if (creationMode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > (orderQuantity * purchasePrice)) {
    return 'Advance amount cannot be more than the total order amount';
  }

  if (creationMode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > 0 && !supplierName) {
    return 'Supplier is required when paying an advance amount';
  }

  if (creationMode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > 0 && !form.bank_account_id) {
    return 'Select a bank account for the advance payment';
  }

  return '';
};

export const buildProductCreationPayload = (form) => {
  const creationMode = form.creation_mode || PRODUCT_CREATION_MODE.INVENTORY;
  const advanceAmount = toNumber(form.advance_amount);
  const supplierName = String(form.supplier || '').trim();

  return {
    ...form,
    quantity_available: creationMode === PRODUCT_CREATION_MODE.ORDER ? 0 : toNumber(form.quantity_available),
    purchase_price: toNumber(form.purchase_price),
    selling_price: toNumber(form.selling_price),
    supplier: supplierName || undefined,
    gst_percent: toNumber(form.gst_percent),
    hsn_code: form.hsn_code || undefined,
    reorder_point: toNumber(form.reorder_point) || 10,
    reorder_quantity: toNumber(form.reorder_quantity) || 0,
    barcode: form.barcode || undefined,
    expiry_date: form.expiry_date || undefined,
    batch_number: form.batch_number || undefined,
    manufacturing_date: form.manufacturing_date || undefined,
    order_quantity: creationMode === PRODUCT_CREATION_MODE.ORDER ? toNumber(form.order_quantity) : undefined,
    advance_amount: creationMode === PRODUCT_CREATION_MODE.ORDER ? advanceAmount : undefined,
    bank_account_id: creationMode === PRODUCT_CREATION_MODE.ORDER && advanceAmount > 0 && form.bank_account_id
      ? Number(form.bank_account_id)
      : undefined
  };
};