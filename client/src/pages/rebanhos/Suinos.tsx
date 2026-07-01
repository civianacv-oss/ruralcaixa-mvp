import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Suinos() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/rebanhos?especie=suino", { replace: true });
  }, [navigate]);
  return null;
}
