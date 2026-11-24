"use client";

import { useActionState } from "react";
import { acceptInvitationAction } from "./actions";
import { Alert, SubmitButton } from "@/components/ui/form";

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton>Accepter l'invitation</SubmitButton>
    </form>
  );
}
