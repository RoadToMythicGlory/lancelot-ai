'use client';

import React from 'react';

export default function ButtonsWidget() {
  const handleOpenViewBoard = () => {
    window.open('/MCR/view-board', '_blank');
  };

  const handleOpenEditBoard = () => {
    window.open('/MCR/edit-board', '_blank');
  };

  const handleOpenMCRMap = () => {
    // MCR MAP - Will be implemented later as specified
    alert('MCR MAP - יבוצע בהמשך');
  };

  return (
    <div className="h-full bg-white rounded-lg shadow-lg p-4 flex items-center justify-center gap-4">
      <button
        onClick={handleOpenViewBoard}
        className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
      >
        לוח פעילויות צפייה
      </button>
      <button
        onClick={handleOpenEditBoard}
        className="px-6 py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors"
      >
        לוח פעילויות עריכה
      </button>
      <button
        onClick={handleOpenMCRMap}
        className="px-6 py-3 bg-purple-500 text-white font-medium rounded-lg hover:bg-purple-600 transition-colors"
      >
        MCR MAP
      </button>
    </div>
  );
}






