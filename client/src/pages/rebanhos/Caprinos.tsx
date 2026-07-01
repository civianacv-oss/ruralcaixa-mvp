import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Caprinos() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/rebanhos?especie=caprino", { replace: true });
  }, [navigate]);
  return null;
}
