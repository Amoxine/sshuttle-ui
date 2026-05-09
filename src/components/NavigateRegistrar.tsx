import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { registerAppNavigate } from "@/utils/appNavigate";

/** Bridges react-router into module-level `appNavigate()` for toast actions. */
export function NavigateRegistrar(): null {
  const navigate = useNavigate();

  useEffect(() => {
    registerAppNavigate(navigate);
  }, [navigate]);

  return null;
}
