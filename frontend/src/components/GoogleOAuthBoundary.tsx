import type { ReactNode } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';

export default function GoogleOAuthBoundary({
  children,
  clientId,
}: {
  children: ReactNode;
  clientId: string;
}) {
  if (!clientId) {
    return <>{children}</>;
  }

  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}
