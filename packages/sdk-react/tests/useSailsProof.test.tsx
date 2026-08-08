import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SailsProvider } from '../src/providers/SailsProvider'
import { useSailsProof } from '../src/hooks/useSailsProof'
import type { SailsClient } from '@sails/sdk'

function mockClient(): SailsClient {
  return {
    proof: {
      assertClaim: vi.fn().mockResolvedValue({ id: 'claim-1', claimType: 'payment_sent', assertion: { intentId: 'intent-1' }, claimedBy: 'participant-1', createdAt: '2026-08-01T00:00:00Z' }),
      submitProof: vi.fn().mockResolvedValue({ id: 'proof-1', claimId: 'claim-1', evidenceHash: 'abc123', submittedBy: 'participant-1', submittedAt: '2026-08-01T00:00:00Z' }),
      issueVerificationNonce: vi.fn().mockResolvedValue({ nonce: 'nonce-abc-123' }),
      verifyProof: vi.fn().mockResolvedValue({ id: 'verif-1', proofId: 'proof-1', verifiedBy: 'arbiter-1', verdict: 'ACCEPTED', reason: null, verifiedAt: '2026-08-01T00:00:00Z' }),
      getEvidenceBundle: vi.fn().mockResolvedValue({ claim: { id: 'claim-1', claimType: 'payment_sent', assertion: { intentId: 'intent-1' }, claimedBy: 'participant-1', createdAt: '2026-08-01T00:00:00Z' }, proofs: [] }),
    },
  } as unknown as SailsClient
}

function errorClient(): SailsClient {
  return {
    proof: {
      assertClaim: vi.fn().mockRejectedValue(new Error('Claim failed')),
      submitProof: vi.fn().mockRejectedValue(new Error('Proof submit failed')),
      issueVerificationNonce: vi.fn().mockRejectedValue(new Error('Nonce failed')),
      verifyProof: vi.fn().mockRejectedValue(new Error('Verify failed')),
      getEvidenceBundle: vi.fn().mockRejectedValue(new Error('Evidence bundle failed')),
    },
  } as unknown as SailsClient
}

function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

describe('useSailsProof', () => {
  let client: SailsClient
  let queryClient: QueryClient

  beforeEach(() => {
    client = mockClient()
    queryClient = makeQueryClient()
  })

  function renderHookWithProvider() {
    return renderHook(() => useSailsProof('claim-1', 'proof-1'), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <SailsProvider client={client}>{children}</SailsProvider>
        </QueryClientProvider>
      ),
    })
  }

  it('getEvidenceBundle query calls client.proof.getEvidenceBundle with claimId', async () => {
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.getEvidenceBundle.isSuccess).toBe(true)
    })

    expect(client.proof.getEvidenceBundle).toHaveBeenCalledWith('claim-1')
  })

  it('getEvidenceBundle query surfaces an error when the transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()

    await waitFor(() => {
      expect(result.current.getEvidenceBundle.isError).toBe(true)
    })

    expect(result.current.getEvidenceBundle.error).toBeInstanceOf(Error)
    expect((result.current.getEvidenceBundle.error as Error).message).toBe('Evidence bundle failed')
  })

  it('assertClaim mutation calls client.proof.assertClaim and invalidates on success', async () => {
    const { result } = renderHookWithProvider()

    await act(async () => {
      await result.current.assertClaim.mutateAsync({ claimType: 'payment_sent', assertion: { intentId: 'intent-1' } })
    })

    expect(client.proof.assertClaim).toHaveBeenCalledWith({ claimType: 'payment_sent', assertion: { intentId: 'intent-1' } })
  })

  it('assertClaim mutation surfaces an error when the transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()

    await act(async () => {
      await expect(result.current.assertClaim.mutateAsync({ claimType: 'payment_sent', assertion: { intentId: 'intent-1' } })).rejects.toThrow('Claim failed')
    })
  })

  it('submitProof mutation calls client.proof.submitProof', async () => {
    const { result } = renderHookWithProvider()

    await act(async () => {
      await result.current.submitProof.mutateAsync({ claimId: 'claim-1', evidence: { amount: '500' } })
    })

    expect(client.proof.submitProof).toHaveBeenCalledWith({ claimId: 'claim-1', evidence: { amount: '500' } })
  })

  it('submitProof mutation surfaces an error when the transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()

    await act(async () => {
      await expect(result.current.submitProof.mutateAsync({ claimId: 'claim-1', evidence: { amount: '500' } })).rejects.toThrow('Proof submit failed')
    })
  })

  it('issueVerificationNonce mutation calls client.proof.issueVerificationNonce', async () => {
    const { result } = renderHookWithProvider()

    await act(async () => {
      await result.current.issueVerificationNonce.mutateAsync('proof-1')
    })

    expect(client.proof.issueVerificationNonce).toHaveBeenCalledWith('proof-1')
  })

  it('issueVerificationNonce mutation surfaces an error when the transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()

    await act(async () => {
      await expect(result.current.issueVerificationNonce.mutateAsync('proof-1')).rejects.toThrow('Nonce failed')
    })
  })

  it('verifyProof mutation calls client.proof.verifyProof with proofId and input', async () => {
    const { result } = renderHookWithProvider()

    await act(async () => {
      await result.current.verifyProof.mutateAsync({ proofId: 'proof-1', input: { verdict: 'ACCEPTED', nonce: 'nonce-abc-123' } })
    })

    expect(client.proof.verifyProof).toHaveBeenCalledWith('proof-1', { verdict: 'ACCEPTED', nonce: 'nonce-abc-123' })
  })

  it('verifyProof mutation surfaces an error when the transport rejects', async () => {
    client = errorClient()
    const { result } = renderHookWithProvider()

    await act(async () => {
      await expect(result.current.verifyProof.mutateAsync({ proofId: 'proof-1', input: { verdict: 'ACCEPTED', nonce: 'nonce-abc-123' } })).rejects.toThrow('Verify failed')
    })
  })
})