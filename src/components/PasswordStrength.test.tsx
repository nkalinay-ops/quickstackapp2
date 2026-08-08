import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordStrength, validatePassword, PASSWORD_MIN_LENGTH } from './PasswordStrength';

// ---------------------------------------------------------------------------
// validatePassword
// ---------------------------------------------------------------------------

describe('validatePassword', () => {
  it('rejects passwords shorter than the minimum length', () => {
    const result = validatePassword('short1');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain(`${PASSWORD_MIN_LENGTH} characters`);
  });

  it('rejects passwords that meet length but contain no number', () => {
    const result = validatePassword('abcdefghijkl');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('number');
  });

  it('accepts passwords that meet both requirements', () => {
    const result = validatePassword('securepass123');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a password exactly at the minimum length with a number', () => {
    const password = 'a'.repeat(PASSWORD_MIN_LENGTH - 1) + '1';
    const result = validatePassword(password);
    expect(result.isValid).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = validatePassword('');
    expect(result.isValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PasswordStrength component
// ---------------------------------------------------------------------------

describe('PasswordStrength', () => {
  it('renders nothing when password is empty', () => {
    const { container } = render(<PasswordStrength password="" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "Weak password" for a short password without a number', () => {
    render(<PasswordStrength password="abc" />);
    expect(screen.getByText('Weak password')).toBeInTheDocument();
  });

  it('shows "Medium strength" when only one requirement is met', () => {
    // Long enough but no number
    const password = 'a'.repeat(PASSWORD_MIN_LENGTH);
    render(<PasswordStrength password={password} />);
    expect(screen.getByText('Medium strength')).toBeInTheDocument();
  });

  it('shows "Medium strength" when password has a number but is too short', () => {
    render(<PasswordStrength password="short1" />);
    expect(screen.getByText('Medium strength')).toBeInTheDocument();
  });

  it('shows "Strong password" when both requirements are met', () => {
    render(<PasswordStrength password="securepass123" />);
    expect(screen.getByText('Strong password')).toBeInTheDocument();
  });

  it('renders all requirement labels', () => {
    render(<PasswordStrength password="x" />);
    expect(screen.getByText(/At least \d+ characters/)).toBeInTheDocument();
    expect(screen.getByText(/Contains at least 1 number/)).toBeInTheDocument();
  });
});
