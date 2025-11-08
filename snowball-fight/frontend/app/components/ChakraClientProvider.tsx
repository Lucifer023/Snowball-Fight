"use client";

import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import React from 'react';

const theme = extendTheme({
  styles: {
    global: {
      body: {
        bg: '#0f0f10',
      },
    },
  },
});

export default function ChakraClientProvider({ children }: { children: React.ReactNode }) {
  return <ChakraProvider theme={theme}>{children}</ChakraProvider>;
}
