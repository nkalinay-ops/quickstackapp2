import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlertModal } from './AlertModal';

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  message: 'Something went wrong.',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AlertModal — visibility', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<AlertModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the message when isOpen is true', () => {
    render(<AlertModal {...baseProps} />);
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });
});

describe('AlertModal — title', () => {
  it('renders the title when provided', () => {
    render(<AlertModal {...baseProps} title="Error Occurred" />);
    expect(screen.getByText('Error Occurred')).toBeInTheDocument();
  });

  it('does not render a title element when title is omitted', () => {
    render(<AlertModal {...baseProps} />);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('AlertModal — close interactions', () => {
  it('calls onClose when the X button is clicked', async () => {
    render(<AlertModal {...baseProps} />);
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find((b) => !b.textContent?.includes('OK'));
    await userEvent.click(xButton!);
    expect(baseProps.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the OK button is clicked', async () => {
    render(<AlertModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /OK/i }));
    expect(baseProps.onClose).toHaveBeenCalledOnce();
  });
});

describe('AlertModal — type variants', () => {
  it('applies red icon color for error type', () => {
    const { container } = render(<AlertModal {...baseProps} type="error" />);
    // The icon wrapper div carries bg-red-950
    expect(container.querySelector('.bg-red-950')).toBeTruthy();
  });

  it('applies green icon color for success type', () => {
    const { container } = render(<AlertModal {...baseProps} type="success" />);
    expect(container.querySelector('.bg-green-950')).toBeTruthy();
  });

  it('applies blue icon color for info type', () => {
    const { container } = render(<AlertModal {...baseProps} type="info" />);
    expect(container.querySelector('.bg-blue-950')).toBeTruthy();
  });

  it('defaults to info (blue) styling when type is omitted', () => {
    const { container } = render(<AlertModal {...baseProps} />);
    expect(container.querySelector('.bg-blue-950')).toBeTruthy();
  });
});
