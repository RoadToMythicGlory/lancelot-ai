'use client';

import React from 'react';
import { Modal, Alert } from 'antd';

interface ConstraintWarningModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  errors: string[];
  warnings?: string[];
  /** When `true`, the user can proceed anyway (mostly for soft warnings). */
  allowOverride?: boolean;
}

/**
 * Reused from any constraint-checking pathway (preferences submit, swap
 * request, shift edit, etc.) to show users why their action is blocked.
 */
export default function ConstraintWarningModal({
  open,
  onClose,
  onConfirm,
  errors,
  warnings = [],
  allowOverride = false,
}: ConstraintWarningModalProps) {
  const hasErrors = errors.length > 0;
  return (
    <Modal
      title={hasErrors ? 'הגבלות לא תקינות' : 'אזהרות'}
      open={open}
      onCancel={onClose}
      onOk={hasErrors && !allowOverride ? onClose : onConfirm || onClose}
      okText={hasErrors && !allowOverride ? 'הבנתי' : 'המשך בכל זאת'}
      cancelText="ביטול"
      okButtonProps={{ danger: hasErrors }}
    >
      {hasErrors && (
        <Alert
          message="אילוצים שלא עומדים בחוקי המחלקה"
          description={
            <ul className="list-disc pr-5 mb-0">
              {errors.map((e, i) => (
                <li key={`e-${i}`}>{e}</li>
              ))}
            </ul>
          }
          type="error"
          showIcon
          className="mb-3"
        />
      )}
      {warnings.length > 0 && (
        <Alert
          message="אזהרות"
          description={
            <ul className="list-disc pr-5 mb-0">
              {warnings.map((w, i) => (
                <li key={`w-${i}`}>{w}</li>
              ))}
            </ul>
          }
          type="warning"
          showIcon
        />
      )}
    </Modal>
  );
}
