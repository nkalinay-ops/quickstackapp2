import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmModal } from './ConfirmModal';

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Delete Comic',
  message: 'Are you sure you want to delete this comic?',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConfirmModal — visibility', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ConfirmModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders title and message when isOpen is true', () => {
    render(<ConfirmModal {...baseProps} />);
    expect(screen.getByText('Delete Comic')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this comic?')).toBeInTheDocument();
  });
});

describe('ConfirmModal — confirm action', () => {
  it('calls onConfirm when the confirm button is clicked', async () => {
    render(<ConfirmModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(baseProps.onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onClose when the confirm button is clicked', async () => {
    render(<ConfirmModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(baseProps.onClose).toHaveBeenCalledOnce();
  });
});

describe('ConfirmModal — cancel action', () => {
  it('calls onClose when cancel button is clicked', async () => {
    render(<ConfirmModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(baseProps.onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onConfirm when cancel button is clicked', async () => {
    render(<ConfirmModal {...baseProps} />);
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });

  it('calls onClose when the X button is clicked', async () => {
    render(<ConfirmModal {...baseProps} />);
    // X is an icon-only button — query by the SVG wrapper
    const buttons = screen.getAllByRole('button');
    // The X button is distinct from Confirm and Cancel — find by process of elimination
    const xButton = buttons.find(
      (b) => !b.textContent?.match(/Confirm|Cancel/)
    );
    await userEvent.click(xButton!);
    expect(baseProps.onClose).toHaveBeenCalled();
  });

  it('does NOT call onConfirm when the X button is clicked', async () => {
    render(<ConfirmModal {...baseProps} />);
    const buttons = screen.getAllByRole('button');
    const xButton = buttons.find((b) => !b.textContent?.match(/Confirm|Cancel/));
    await userEvent.click(xButton!);
    expect(baseProps.onConfirm).not.toHaveBeenCalled();
  });
});

describe('ConfirmModal — destructive styling', () => {
  it('applies red styling to the confirm button when isDestructive is true', () => {
    render(<ConfirmModal {...baseProps} isDestructive={true} confirmText="Delete" />);
    const confirmBtn = screen.getByRole('button', { name: /Delete/i });
    expect(confirmBtn.className).toContain('bg-red-600');
  });

  it('applies blue styling to the confirm button when isDestructive is false', () => {
    render(<ConfirmModal {...baseProps} isDestructive={false} confirmText="Move" />);
    const confirmBtn = screen.getByRole('button', { name: /Move/i });
    expect(confirmBtn.className).toContain('bg-blue-600');
  });
});

describe('ConfirmModal — custom button text', () => {
  it('renders custom confirmText', () => {
    render(<ConfirmModal {...baseProps} confirmText="Remove" />);
    expect(screen.getByRole('button', { name: /Remove/i })).toBeInTheDocument();
  });

  it('renders custom cancelText', () => {
    render(<ConfirmModal {...baseProps} cancelText="Keep It" />);
    expect(screen.getByRole('button', { name: /Keep It/i })).toBeInTheDocument();
  });

  it('defaults to "Confirm" when confirmText is omitted', () => {
    render(<ConfirmModal {...baseProps} />);
    expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeInTheDocument();
  });

  it('defaults to "Cancel" when cancelText is omitted', () => {
    render(<ConfirmModal {...baseProps} />);
    expect(screen.getByRole('button', { name: /^Cancel$/i })).toBeInTheDocument();
  });
});
