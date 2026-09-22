import {
  Create,
  SimpleForm,
  SelectInput,
  TextInput,
  NumberInput,
  ReferenceInput,
  AutocompleteInput,
  required,
  minLength,
  minValue,
  email,
} from 'react-admin'
import { useWatch } from 'react-hook-form'

// Smallest-currency-unit strings server-side (USD cents) — entered here in dollars.
const toCents = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : String(Math.round(Number(v) * 100)))

/**
 * A TumaPlus network agent IS a person and signs in as one, so it needs a linked account — every
 * flow that lets one act resolves the agent from the signed-in user. An institution's counter is a
 * place, staffed by whoever business_staff posts to it, and needs none. The requirement therefore
 * follows the institution field rather than being fixed, mirroring the rule
 * AgentOnboardingService.create enforces server-side.
 */
function LinkedAccountInput() {
  const businessId = useWatch({ name: 'business_id' })

  return (
    <ReferenceInput source="user_id" reference="users">
      <AutocompleteInput
        label="Linked user account"
        optionText={(u) => (u ? `${u.full_name} — ${u.email}` : '')}
        validate={businessId ? undefined : required()}
        filterToQuery={(q) => ({ q })}
        helperText={
          businessId
            ? 'Leave blank — a counter is a place, and its staff are posted to it separately.'
            : 'Required: a network agent signs in with this account.'
        }
      />
    </ReferenceInput>
  )
}

export function AgentCreate() {
  return (
    <Create redirect="show">
      <SimpleForm>
        <ReferenceInput source="business_id" reference="businesses">
          <AutocompleteInput
            label="Institution"
            optionText="name"
            filterToQuery={(q) => ({ q })}
            helperText="Leave blank for a TumaPlus network agent. Set it to open a partner's counter."
          />
        </ReferenceInput>
        <LinkedAccountInput />
        <TextInput source="full_name" validate={[required(), minLength(3)]} />
        <TextInput source="business_name" label="Business/outlet name" helperText="Optional — shown instead of full_name when set" />
        <SelectInput
          source="tier"
          choices={[
            { id: 'agent', name: 'Agent' },
            { id: 'super_agent', name: 'Super agent' },
            { id: 'distributor', name: 'Distributor' },
            { id: 'master', name: 'Master' },
          ]}
          defaultValue="agent"
          validate={required()}
          helperText="Agent/Super agent must have a parent below. Master can never have one. Distributor may go either way."
        />
        <ReferenceInput source="parent_agent_id" reference="agents">
          <AutocompleteInput
            label="Parent agent (sponsor)"
            optionText={(a) => (a ? `${a.full_name} (${a.tier})` : '')}
            filterToQuery={(q) => ({ q })}
            validate={(value, allValues) =>
              ['agent', 'super_agent'].includes(allValues.tier) && !value
                ? 'Required for this tier'
                : allValues.tier === 'master' && value
                  ? 'A master cannot have a parent'
                  : undefined
            }
          />
        </ReferenceInput>
        <TextInput source="email" validate={[required(), email()]} />
        <TextInput source="phone" validate={required()} />
        <TextInput source="region" helperText="Optional — geographic region, for geofencing" />
        <TextInput source="city" helperText="Optional" />
        <TextInput source="address" helperText="Optional" />
        <NumberInput source="latitude" helperText="Optional" />
        <NumberInput source="longitude" helperText="Optional" />
        <TextInput source="code" helperText="Optional — auto-generated if left blank" />
        <NumberInput
          source="commission_rate"
          label="Commission rate (%)"
          helperText="Optional — defaults to 2.5%"
        />
        <NumberInput
          source="per_transaction_limit"
          label="Per-transaction limit (USD)"
          parse={toCents}
          helperText="Optional — leave blank for uncapped"
          validate={minValue(0.01, 'Must be greater than 0')}
        />
        <NumberInput
          source="daily_limit"
          label="Daily limit (USD)"
          parse={toCents}
          helperText="Optional — leave blank for uncapped"
          validate={minValue(0.01, 'Must be greater than 0')}
        />
        <NumberInput
          source="monthly_limit"
          label="Monthly limit (USD)"
          parse={toCents}
          helperText="Optional — leave blank for uncapped"
          validate={minValue(0.01, 'Must be greater than 0')}
        />
      </SimpleForm>
    </Create>
  )
}
