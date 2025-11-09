"use client";
import React from 'react';

type Props = {
  color: string;
  selected: boolean;
  onClick: () => void;
};

export default function ColorSwatch({ color, selected, onClick }: Props) {
  return (
    <div
      role="button"
      aria-label={`color ${color}`}
      onClick={onClick}
      style={{ width: 32, height: 32, background: color, borderRadius: 4, cursor: 'pointer', boxShadow: selected ? '0 0 0 3px #fff inset' : 'none' }}
    />
  );
}
