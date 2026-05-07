import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Swords } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");

    if (token) {
      localStorage.setItem("streamer-token", token);
      navigate(createPageUrl("Dashboard"));
    } else if (error) {
      navigate(createPageUrl("Login") + `?error=${error}`);
    } else {
      navigate(createPageUrl("Login"));
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#6C63FF] flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Swords size={28} className="text-white" />
        </div>
        <p className="text-[#A0A0B0]">Signing you in...</p>
      </div>
    </div>
  );
}
