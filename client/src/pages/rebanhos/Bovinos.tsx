import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Bovinos() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/rebanhos?especie=bovino", { replace: true });
  }, [navigate]);
  return null;
}
