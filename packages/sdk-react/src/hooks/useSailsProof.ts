import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from '@tanstack/react-query'
import type { Proof, Verification, EvidenceBundle, AssertClaimInput, SubmitProofInput, VerifyProofInput } from '@satsails/p2p-trading-sdk'
import { useSailsClient } from './useSailsClient'

export interface UseSailsProofResult {
  getEvidenceBundle: UseQueryResult<EvidenceBundle>
  assertClaim: UseMutationResult<Proof, Error, AssertClaimInput>
  submitProof: UseMutationResult<Proof, Error, SubmitProofInput>
  issueVerificationNonce: UseMutationResult<{ nonce: string }, Error, string>
  verifyProof: UseMutationResult<Verification, Error, { proofId: string; input: VerifyProofInput }>
}

/**
 * Wraps `proof.assertClaim/submitProof/issueVerificationNonce/verifyProof/getEvidenceBundle`
 * (all real — packages/sails-sdk/src/modules/proof.ts, verified
 * against src/modules/open-proof/proof.routes.ts directly).
 * Every mutation invalidates the relevant queries on success — no
 * caller-side refetch plumbing needed. `claimId`/`proofId` may be
 * undefined (query stays disabled, mutations simply aren't called yet)
 * the same way useSailsTrade() handles an unresolved id.
 */
export function useSailsProof(claimId: string | undefined, _proofId: string | undefined): UseSailsProofResult {
  const client = useSailsClient()
  const queryClient = useQueryClient()

  const evidenceBundleKey = ['sails', 'proof', 'evidence-bundle', claimId] as const

  const getEvidenceBundle = useQuery({
    queryKey: evidenceBundleKey,
    queryFn: () => client.proof.getEvidenceBundle(claimId as string),
    enabled: Boolean(claimId),
  })

  function invalidateEvidenceBundle(): Promise<void> {
    return queryClient.invalidateQueries({ queryKey: evidenceBundleKey })
  }

  const assertClaim = useMutation({
    mutationFn: (input: AssertClaimInput) => client.proof.assertClaim(input),
    onSuccess: invalidateEvidenceBundle,
  })

  const submitProof = useMutation({
    mutationFn: (input: SubmitProofInput) => client.proof.submitProof(input),
    onSuccess: invalidateEvidenceBundle,
  })

  const issueVerificationNonce = useMutation({
    mutationFn: (proofId: string) => client.proof.issueVerificationNonce(proofId),
  })

  const verifyProof = useMutation({
    mutationFn: ({ proofId, input }: { proofId: string; input: VerifyProofInput }) =>
      client.proof.verifyProof(proofId, input),
  })

  return { getEvidenceBundle, assertClaim, submitProof, issueVerificationNonce, verifyProof }
}