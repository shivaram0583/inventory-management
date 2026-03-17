import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

const SortableHeader = ({ label, sortKey, sortConfig, onSort, className = '' }) => {
  const isSorted = sortConfig?.key === sortKey;
  const isAsc = isSorted && sortConfig.direction === 'asc';
  const isDesc = isSorted && sortConfig.direction === 'desc';

  return (
    <th
      className={`cursor-pointer select-none transition-all duration-150 ${className}`}
      style={isSorted ? {background:'linear-gradient(90deg,#eef2ff,#f5f3ff)'} : {}}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1 group">
        <span className={isSorted ? 'text-indigo-700' : ''}>{label}</span>
        <span className={`transition-transform duration-150 ${isSorted ? 'text-indigo-500' : 'text-gray-300 group-hover:text-indigo-300'}`}>
          {isAsc ? (
            <ChevronUp className="h-3 w-3" />
          ) : isDesc ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronsUpDown className="h-3 w-3" />
          )}
        </span>
      </span>
    </th>
  );
};

export default SortableHeader;
