import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Swords, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PageNotFound() {
  return (
    <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-6">
      <div className="text-center">
        <div className="inline-flex p-4 rounded-2xl bg-[#6C63FF]/10 mb-6">
          <Swords size={40} className="text-[#6C63FF]" />
        </div>
        <h1 className="text-6xl font-bold text-white mb-2">404</h1>
        <p className="text-lg text-[#A0A0B0] mb-6">This page doesn't exist</p>
        <Link to={createPageUrl("Dashboard")}>
          <Button className="bg-[#6C63FF] hover:bg-[#5B54E6] text-white gap-2">
            <ArrowLeft size={16} />
            Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}