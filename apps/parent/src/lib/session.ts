import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "./api";

/** Signs out this phone only: the server forgets the device, and everything cached here is cleared. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* offline or already signed out: the local sign-out below is what matters */
    }
    setToken(null);
    queryClient.clear();
    navigate("/login", { replace: true });
  }, [queryClient, navigate]);
}
