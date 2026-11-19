import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

interface Credential {
  accessToken: string;
  tokenRevision: number;
}

interface RunAgentAccess extends Credential {
  setAccessToken: (_token: string) => void;
}

const RunAgentAccessContext = createContext<RunAgentAccess | null>(null);

export function RunAgentAccessProvider({ children }: PropsWithChildren) {
  const [credential, setCredential] = useState<Credential>({
    accessToken: '',
    tokenRevision: 0,
  });
  const setAccessToken = useCallback((token: string) => {
    const accessToken = token.trim();
    setCredential((previous) =>
      previous.accessToken === accessToken
        ? previous
        : { accessToken, tokenRevision: previous.tokenRevision + 1 }
    );
  }, []);
  const access = useMemo(
    () => ({ ...credential, setAccessToken }),
    [credential, setAccessToken]
  );
  return (
    <RunAgentAccessContext value={access}>{children}</RunAgentAccessContext>
  );
}

export function useRunAgentAccess(): RunAgentAccess {
  const access = use(RunAgentAccessContext);
  if (!access) throw new Error('RunAgent access requires the Classic theme.');
  return access;
}
