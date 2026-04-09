const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => Math.round(toNumber(value) * 100) / 100;

function calculateOutstandingSupplierBalance({
  totalReceivedValue = 0,
  totalReturnedValue = 0,
  totalPaid = 0
}) {
  return roundCurrency(
    toNumber(totalReceivedValue) - toNumber(totalReturnedValue) - toNumber(totalPaid)
  );
}

module.exports = {
  calculateOutstandingSupplierBalance
};