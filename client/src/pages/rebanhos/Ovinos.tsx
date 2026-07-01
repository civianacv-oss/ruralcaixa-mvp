import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Ovinos() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/rebanhos?especie=ovino", { replace: true });
  }, [navigate]);
  return null;
}
