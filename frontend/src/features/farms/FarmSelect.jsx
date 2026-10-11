import { inputClass, optionClass } from '../../components/ui/FormField.jsx'

export default function FarmSelect({ id, farms, value, onChange, placeholder = 'Selecciona una granja', invalid, ...props }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={inputClass}
      {...props}
    >
      <option className={optionClass} value="">{placeholder}</option>
      {farms.map((farm) => (
        <option className={optionClass} key={farm.id} value={farm.id}>
          {farm.name} — {farm.location}
        </option>
      ))}
    </select>
  )
}
