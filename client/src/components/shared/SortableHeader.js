import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const SortableHeader = ({ label, sortKey, sortConfig, onSort, className = '' }) => {
  const isSorted = sortConfig?.key === sortKey;
  const isAsc = isSorted && sortConfig.direction === 'asc';
  const isDesc = isSorted && sortConfig.direction === 'desc';

  return (
    <th
      className={`cursor-pointer select-none hover:bg-gray-100 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="text-gray-400">
          {isAsc ? (
            <ChevronUp className="h-3 w-3 text-blue-500" />
          ) : isDesc ? (
            <ChevronDown className="h-3 w-3 text-blue-500" />
          ) : (
            <ChevronsUpDown className="h-3 w-3" />
          )}
        </span>
      </span>
    </th>
  );
};

export default SortableHeader;
