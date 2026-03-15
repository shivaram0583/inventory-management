import { useState, useMemo } from 'react';

const useSortableData = (items, initialSort = null) => {
  const [sortConfig, setSortConfig] = useState(initialSort);

  const sortedItems = useMemo(() => {
    if (!sortConfig || !items) return items;
    return [...items].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      const comparison = !isNaN(aNum) && !isNaN(bNum)
        ? aNum - bNum
        : String(aVal).localeCompare(String(bVal), 'en-IN', { numeric: true });
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [items, sortConfig]);

  const requestSort = (key) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  return { sortedItems: sortedItems || [], sortConfig, requestSort };
};

export default useSortableData;
