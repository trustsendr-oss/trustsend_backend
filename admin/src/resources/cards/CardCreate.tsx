import { useEffect } from 'react'
import { useFormContext } from 'react-hook-form'
import {
  Create,
  SimpleForm,
  SelectInput,
  ReferenceInput,
  AutocompleteInput,
  NumberInput,
  TextInput,
  FormDataConsumer,
  useGetOne,
  required,
  minValue,
} from 'react-admin'

interface UserWallet {
  id: number
  currency_code: string
  balance: string
  status: string
}

/** Lists the chosen owner's real wallet(s) instead of a free-typed ID — a business has exactly
 * one wallet (its `wallet_id` column); a user can have several, one per currency. Card issuing
 * is USD-only (see card_service.ts createCard()), so USD/active wallets are surfaced first. */
function WalletPicker({ ownerType, ownerId }: { ownerType: 'user' | 'business'; ownerId: number }) {
  const { setValue } = useFormContext()
  const { data, isPending } = useGetOne(ownerType === 'user' ? 'users' : 'businesses', { id: ownerId })

  // Clears a wallet_id carried over from a previously selected owner — it almost certainly
  // doesn't belong to this one.
  useEffect(() => {
    setValue('wallet_id', undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, ownerId])

  if (isPending) {
    return <SelectInput source="wallet_id" choices={[]} disabled helperText="Loading wallets…" />
  }

  if (ownerType === 'business') {
    const walletId = data?.wallet_id as number | null | undefined
    return (
      <SelectInput
        source="wallet_id"
        choices={walletId ? [{ id: walletId, name: `Wallet #${walletId}` }] : []}
        helperText={walletId ? 'This business has a single wallet.' : 'This business has no wallet — assign one before issuing a card.'}
        validate={[required(), minValue(1, 'Must be a real wallet ID')]}
      />
    )
  }

  const wallets: UserWallet[] = data?.wallets || []
  const eligible = wallets.filter((w) => w.currency_code === 'USD' && w.status === 'active')
  const rest = wallets.filter((w) => !eligible.includes(w))
  const choices = [...eligible, ...rest].map((w) => ({
    id: w.id,
    name: `#${w.id} — ${w.currency_code} (${w.status})${eligible.includes(w) ? '' : ' — not eligible'}`,
  }))

  return (
    <SelectInput
      source="wallet_id"
      choices={choices}
      helperText={choices.length === 0 ? 'This user has no wallets.' : 'Card issuing is USD-only — pick an active USD wallet.'}
      validate={[required(), minValue(1, 'Must be a real wallet ID')]}
    />
  )
}

/** Admin-initiated card issuance on behalf of a user or business. Mirrors the self-service
 * POST /api/v1/cards flow but skips the cardholder PIN — see admin/cards_controller.ts store(). */
export function CardCreate() {
  return (
    <Create
      redirect="show"
      transform={(data) => ({
        ...data,
        amount: String(Math.round(Number(data.amount) * 100)),
      })}
    >
      <SimpleForm>
        <SelectInput
          source="owner_type"
          choices={[
            { id: 'user', name: 'User' },
            { id: 'business', name: 'Business' },
          ]}
          defaultValue="user"
          validate={required()}
        />
        <FormDataConsumer>
          {({ formData }) =>
            formData.owner_type === 'business' ? (
              <ReferenceInput source="owner_id" reference="businesses">
                <AutocompleteInput
                  label="Business"
                  optionText={(b) => (b ? `${b.name} — ${b.email}` : '')}
                  validate={required()}
                  filterToQuery={(q) => ({ q })}
                />
              </ReferenceInput>
            ) : (
              <ReferenceInput source="owner_id" reference="users">
                <AutocompleteInput
                  label="User"
                  optionText={(u) => (u ? `${u.full_name || u.email} — ${u.email}` : '')}
                  validate={required()}
                  filterToQuery={(q) => ({ q })}
                />
              </ReferenceInput>
            )
          }
        </FormDataConsumer>
        {/* Always mounted — react-admin doesn't unregister a field's validator when a
         * FormDataConsumer stops rendering it (shouldUnregister defaults to false), so a
         * plain `required()` here would keep blocking submission even after switching to
         * "Business" and hiding the field. Making requiredness depend on the sibling
         * owner_type value instead avoids that trap. */}
        <TextInput
          source="phone"
          label="Owner phone"
          helperText="Required for a user owner only — users have no phone on file, and Payscribe needs one to create their customer profile. Ignored for a business (its own phone is used)."
          validate={(value, allValues) => (allValues.owner_type === 'user' && !value ? 'Required' : undefined)}
        />
        <FormDataConsumer>
          {({ formData }) =>
            formData.owner_id ? (
              <WalletPicker ownerType={formData.owner_type} ownerId={formData.owner_id} />
            ) : (
              <SelectInput source="wallet_id" choices={[]} disabled helperText="Pick an owner above first." />
            )
          }
        </FormDataConsumer>
        <SelectInput
          source="brand"
          choices={[
            { id: 'VISA', name: 'VISA' },
            { id: 'MASTERCARD', name: 'MASTERCARD' },
          ]}
          defaultValue="VISA"
          validate={required()}
        />
        <NumberInput
          source="amount"
          label="Initial funding amount (USD)"
          helperText="Debited from the wallet above and loaded onto the new card."
          validate={[required(), minValue(0.01, 'Must be greater than 0')]}
        />
      </SimpleForm>
    </Create>
  )
}
