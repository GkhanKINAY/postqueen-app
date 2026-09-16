import { FC, useEffect, useState } from 'react';
import {
  Integrations,
} from '@gitroom/frontend/components/launches/calendar.context';
import { PickPlatforms } from '@gitroom/frontend/components/launches/helpers/pick.platform.component';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Select } from '@gitroom/react/form/select';
import { Slider } from '@gitroom/react/form/slider';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { FormSection } from '@gitroom/react/form/form.section';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
const delayOptions = [
  {
    name: 'Immediately',
    value: 0,
  },
  {
    name: '1 hour',
    value: 3600000,
  },
  {
    name: '2 hours',
    value: 7200000,
  },
  {
    name: '3 hours',
    value: 10800000,
  },
  {
    name: '8 hours',
    value: 28800000,
  },
  {
    name: '12 hours',
    value: 43200000,
  },
  {
    name: '15 hours',
    value: 54000000,
  },
  {
    name: '24 hours',
    value: 86400000,
  },
];
export const InternalChannels: FC<{
  plugs: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  }[];
}> = (props) => {
  const { plugs } = props;
  return (
    <div>
      {plugs.map((plug, index) => (
        <Plug plug={plug} key={index} />
      ))}
    </div>
  );
};
const PlugField: FC<{
  plugIdentifier: string;
  field: {
    name: string;
    description: string;
    type: string;
    placeholder: string;
    validation?: RegExp;
  };
}> = ({ plugIdentifier, field }) => {
  const fieldName = `plug--${plugIdentifier}--${field.name}`;

  if (field.type === 'textarea') {
    return (
      <Textarea
        label={field.description}
        name={fieldName}
        placeholder={field.placeholder}
      />
    );
  }

  return (
    <Input
      label={field.description}
      name={fieldName}
      placeholder={field.placeholder}
    />
  );
};

const Plug: FC<{
  plug: {
    identifier: string;
    title: string;
    description: string;
    pickIntegration: string[];
    fields: {
      name: string;
      description: string;
      type: string;
      placeholder: string;
      validation?: RegExp;
    }[];
  };
}> = ({ plug }) => {
  const { allIntegrations, integration } = useIntegration();
  const t = useT();

  const { watch, setValue, control, register } = useSettings();
  const [load, setLoad] = useState(false);
  const val = watch(`plug--${plug.identifier}--integrations`);
  const active = watch(`plug--${plug.identifier}--active`);
  useEffect(() => {
    setTimeout(() => {
      setLoad(true);
    }, 20);
  }, []);
  const [localValue, setLocalValue] = useState<Integrations[]>(
    (val || []).map((p: any) => ({
      ...p,
    }))
  );
  useEffect(() => {
    setValue(`plug--${plug.identifier}--integrations`, [...localValue]);
  }, [localValue, plug, setValue]);
  const [allowedIntegrations] = useState(
    allIntegrations.filter(
      (i) =>
        plug.pickIntegration.includes(i.identifier) && integration?.id !== i.id
    )
  );
  if (!load) {
    return null;
  }
  return (
    <FormSection>
      <div className="flex items-center gap-[12px]">
        <div className="min-w-0 flex-1 text-[13px] font-[600] text-pqText">
          {plug.title}
        </div>
        <Slider
          value={active ? 'on' : 'off'}
          onChange={(p) =>
            setValue(`plug--${plug.identifier}--active`, p === 'on')
          }
          fill={true}
        />
      </div>
      {active ? (
        <div className="flex flex-col gap-[12px]">
          <div className="text-[13px] leading-[1.45] text-pqMuted">
            {plug.description}
          </div>
          {!allowedIntegrations.length ? (
            <div className="text-[13px] text-pqMuted">
              No available accounts
            </div>
          ) : (
            <>
              <Select
                label="Delay"
                hideErrors={true}
                {...register(`plug--${plug.identifier}--delay`, {
                  value: 3600000,
                })}
              >
                {delayOptions.map((p) => (
                  <option key={p.name} value={p.value}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {plug.fields.length > 0 && (
                <div className="flex flex-col gap-[12px]">
                  {plug.fields.map((field) => (
                    <PlugField
                      key={field.name}
                      plugIdentifier={plug.identifier}
                      field={field}
                    />
                  ))}
                </div>
              )}
              <div className="text-[13px] font-[500] text-pqMuted">
                {t('accounts_that_will_engage', 'Accounts that will engage:')}
              </div>
              <PickPlatforms
                hide={false}
                integrations={allowedIntegrations}
                selectedIntegrations={localValue}
                singleSelect={false}
                isMain={true}
                onChange={setLocalValue}
              />
            </>
          )}
        </div>
      ) : null}
    </FormSection>
  );
};
