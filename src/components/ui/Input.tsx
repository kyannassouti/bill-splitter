interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ label, className = '', ...props }: InputProps) {
  return (
    <div>
      {label && <label>{label}</label>}
      <input
        className={className}
        {...props}
      />
    </div>
  );
}
