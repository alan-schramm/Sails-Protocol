import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import type { Participant, Ed25519Keypair, AuthenticateResult } from '@sails/sdk'
import { useSailsClient } from './useSailsClient'

export interface UseSailsIdentityResult {
  query: UseQueryResult<Participant>
  create: UseMutationResult<{ participant: Participant; keypair: Ed25519Keypair }, Error, { keypair?: Ed25519Keypair; displayName?: string }>
  createWithPublicKey: UseMutationResult<Participant, Error, { publicKeyHex: string; displayName?: string }>
  challenge: UseMutationResult<{ challenge: string; expiresIn: number }, Error, string>
  authenticate: UseMutationResult<AuthenticateResult, Error, Ed25519Keypair>
  authenticateWithWallet: UseMutationResult<AuthenticateResult, Error, { publicKeyHex: string; wallet: { signMessage(message: Uint8Array): Promise<Uint8Array> } }>
}

/**
 * Wraps `identity.create/createWithPublicKey/challenge/authenticate/authenticateWithWallet/get/me`
 * (all real — packages/sails-sdk/src/modules/identity.ts, verified
 * against src/modules/open-identity/identity.routes.ts directly).
 * `participantId` may be undefined (query stays disabled, mutations
 * simply aren't called yet) the same way useSailsTrade() handles an
 * unresolved id.
 */
export function useSailsIdentity(participantId: string | undefined): UseSailsIdentityResult {
  const client = useSailsClient()
  const queryClient = useQueryClient()
  const queryKey = ['sails', 'identity', participantId] as const

  const query = useQuery({
    queryKey,
    queryFn: () => client.identity.get(participantId as string),
    enabled: Boolean(participantId),
  })

  function invalidate(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey })
  }

  const create = useMutation({
    mutationFn: ({ keypair, displayName }: { keypair?: Ed25519Keypair; displayName?: string }) =>
      client.identity.create(keypair, displayName),
    onSuccess: invalidate,
  })

  const createWithPublicKey = useMutation({
    mutationFn: ({ publicKeyHex, displayName }: { publicKeyHex: string; displayName?: string }) =>
      client.identity.createWithPublicKey(publicKeyHex, displayName),
    onSuccess: invalidate,
  })

  const challenge = useMutation({
    mutationFn: (publicKeyHex: string) => client.identity.challenge(publicKeyHex),
    onSuccess: invalidate,
  })

  const authenticate = useMutation({
    mutationFn: (keypair: Ed25519Keypair) => client.identity.authenticate(keypair),
    onSuccess: invalidate,
  })

  const authenticateWithWallet = useMutation({
    mutationFn: ({ publicKeyHex, wallet }: { publicKeyHex: string; wallet: { signMessage(message: Uint8Array): Promise<Uint8Array> } }) =>
      client.identity.authenticateWithWallet(publicKeyHex, wallet),
    onSuccess: invalidate,
  })

  return { query, create, createWithPublicKey, challenge, authenticate, authenticateWithWallet }
}