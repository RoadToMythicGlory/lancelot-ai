'use client';

import React, { useState } from 'react';
import { MCREvent, BroadcastType } from '../types';
import RichTextEditor from './RichTextEditor';

interface EventFormProps {
  event: MCREvent;
  onClose: () => void;
  onSave: (event: MCREvent) => void;
}

const broadcastTypes: BroadcastType[] = [
  'SRT_CALLER',
  'SRT_LISTENER',
  'DVBS2',
  'DVBS2X',
  'NS4',
  'NS3',
  'RTMP',
  'ZIXI',
  'PRT',
  'LIVEU',
  'KLITA_MOU',
  'OTHER',
];

const broadcastTypeLabels: Record<BroadcastType, string> = {
  'SRT_CALLER': 'SRT CALLER',
  'SRT_LISTENER': 'SRT LISTENER',
  'DVBS2': 'DVBS2',
  'DVBS2X': 'DVBS2X',
  'NS4': 'NS4',
  'NS3': 'NS3',
  'RTMP': 'RTMP',
  'ZIXI': 'ZIXI',
  'PRT': 'PRT',
  'LIVEU': 'LIVEU',
  'KLITA_MOU': 'קליטה מOU',
  'OTHER': 'OTHER',
};

// Helper function to format date for datetime-local input
const formatDateTimeLocal = (date: Date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function EventForm({ event, onClose, onSave }: EventFormProps) {
  const [formData, setFormData] = useState<MCREvent>(event);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      // In a real implementation, we'd upload this file and store its path
      // For now, we'll just store the filename
      setFormData({
        ...formData,
        details: {
          ...formData.details,
          fileContent: file.name,
        },
      });
    }
  };

  const renderBroadcastTypeForm = () => {
    switch (formData.broadcastType) {
      case 'SRT_CALLER':
        return (
          <div className="space-y-4 p-4 bg-[#7ca13d] bg-opacity-20 rounded">
            <input
              type="text"
              placeholder="CALLER IP *"
              className="w-full p-2 border rounded"
              value={formData.details?.ip || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, ip: e.target.value }
              })}
              required
            />
            <input
              type="text"
              placeholder="CALLER PORT *"
              className="w-full p-2 border rounded"
              value={formData.details?.port || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, port: e.target.value }
              })}
              required
            />
            <input
              type="text"
              placeholder="PASSPHRASE"
              className="w-full p-2 border rounded"
              value={formData.details?.passphrase || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, passphrase: e.target.value }
              })}
            />
            <input
              type="text"
              placeholder="Contact *"
              className="w-full p-2 border rounded"
              value={formData.details?.contact || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, contact: e.target.value }
              })}
              required
            />
            <textarea
              placeholder="Notes"
              className="w-full p-2 border rounded"
              rows={3}
              value={formData.details?.notes || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, notes: e.target.value }
              })}
            />
          </div>
        );

      case 'SRT_LISTENER':
        return (
          <div className="space-y-4 p-4 bg-[#a8cc6a] bg-opacity-20 rounded">
            <input
              type="text"
              placeholder="LISTENER IP *"
              className="w-full p-2 border rounded"
              value={formData.details?.ip || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, ip: e.target.value }
              })}
              required
            />
            <input
              type="text"
              placeholder="LISTENER PORT *"
              className="w-full p-2 border rounded"
              value={formData.details?.port || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, port: e.target.value }
              })}
              required
            />
            <input
              type="text"
              placeholder="PASSPHRASE"
              className="w-full p-2 border rounded"
              value={formData.details?.passphrase || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, passphrase: e.target.value }
              })}
            />
            <input
              type="text"
              placeholder="Contact *"
              className="w-full p-2 border rounded"
              value={formData.details?.contact || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, contact: e.target.value }
              })}
              required
            />
            <textarea
              placeholder="Notes"
              className="w-full p-2 border rounded"
              rows={3}
              value={formData.details?.notes || ''}
              onChange={(e) => setFormData({
                ...formData,
                details: { ...formData.details, notes: e.target.value }
              })}
            />
          </div>
        );

      case 'DVBS2':
      case 'DVBS2X':
      case 'NS3':
      case 'NS4':
      case 'KLITA_MOU':
        const bgColors = {
          'DVBS2': '#ed80e8',
          'DVBS2X': '#54b0c7',
          'NS3': '#1b943b',
          'NS4': '#1b943b',
          'KLITA_MOU': '#b135de',
        };
        return (
          <div className="space-y-4 p-4 rounded" style={{ backgroundColor: `${bgColors[formData.broadcastType as keyof typeof bgColors]}20` }}>
            <button
              type="button"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              onClick={() => document.getElementById('file-upload')?.click()}
            >
              העלה מערך לוויני
            </button>
            <input
              id="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileUpload}
            />
            {uploadedFile && (
              <p className="text-sm text-gray-600">קובץ נבחר: {uploadedFile.name}</p>
            )}
            <RichTextEditor
              value={formData.details?.satelliteConfig || ''}
              onChange={(value) => setFormData({
                ...formData,
                details: { ...formData.details, satelliteConfig: value }
              })}
              placeholder="הזן פרטים או גרור קובץ לכאן..."
            />
          </div>
        );

      case 'RTMP':
        return (
          <div className="space-y-4 p-4 bg-[#d46eab] bg-opacity-20 rounded">
            <RichTextEditor
              value={formData.details?.fileContent || ''}
              onChange={(value) => setFormData({
                ...formData,
                details: { ...formData.details, fileContent: value }
              })}
              placeholder="הזן פרטים או גרור קובץ לכאן..."
            />
          </div>
        );

      case 'LIVEU':
        return (
          <div className="space-y-4 p-4 bg-[#e8ca92] bg-opacity-20 rounded">
            <label className="block">
              <span className="text-gray-700">כמות מצלמות</span>
              <input
                type="number"
                min="1"
                className="mt-1 block w-full p-2 border rounded"
                value={formData.details?.cameraCount || 1}
                onChange={(e) => setFormData({
                  ...formData,
                  details: { ...formData.details, cameraCount: parseInt(e.target.value) || 1 }
                })}
              />
            </label>
          </div>
        );

      case 'PRT':
        return (
          <div className="p-4 bg-[#c2e8ed] bg-opacity-20 rounded">
            <p className="text-gray-600">אין צורך בטופס נוסף</p>
          </div>
        );

      case 'OTHER':
        return (
          <div className="space-y-4 p-4 bg-[#e31464] bg-opacity-20 rounded">
            <RichTextEditor
              value={formData.details?.fileContent || ''}
              onChange={(value) => setFormData({
                ...formData,
                details: { ...formData.details, fileContent: value }
              })}
              placeholder="הזן פרטים או גרור קובץ לכאן..."
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6">
          <h2 className="text-2xl font-bold mb-4">עריכת אירוע</h2>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="שם האירוע"
              className="w-full p-2 border rounded"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">תאריך התחלה</label>
                <input
                  type="datetime-local"
                  className="w-full p-2 border rounded"
                  value={formData.start ? formatDateTimeLocal(formData.start) : ''}
                  onChange={(e) => setFormData({ ...formData, start: new Date(e.target.value) })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">תאריך סיום</label>
                <input
                  type="datetime-local"
                  className="w-full p-2 border rounded"
                  value={formData.end ? formatDateTimeLocal(formData.end) : ''}
                  onChange={(e) => setFormData({ ...formData, end: new Date(e.target.value) })}
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">סוג שידור</label>
              <select
                className="w-full p-2 border rounded"
                value={formData.broadcastType || ''}
                onChange={(e) => setFormData({ ...formData, broadcastType: e.target.value as BroadcastType })}
              >
                <option value="">בחר סוג שידור</option>
                {broadcastTypes.map((type) => (
                  <option key={type} value={type}>{broadcastTypeLabels[type]}</option>
                ))}
              </select>
            </div>
            
            {formData.broadcastType && renderBroadcastTypeForm()}
          </div>
          
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              שמור
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}






