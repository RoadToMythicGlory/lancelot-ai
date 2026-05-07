import React from "react";
import { Button } from "@/components/ui/button";

export default function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="p-4 rounded-2xl bg-[#6C63FF]/10 mb-4">
          <Icon size={32} className="text-[#6C63FF]" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {description && <p className="text-sm text-[#A0A0B0] mt-1 max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4 bg-[#6C63FF] hover:bg-[#5B54E6] text-white">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}