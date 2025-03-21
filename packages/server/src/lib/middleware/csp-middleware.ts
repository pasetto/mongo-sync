import { Request, Response, NextFunction } from 'express';
import * as cryptoNode from 'crypto';

interface CSPOptions {
  reportUri?: string;
}

interface CSPDirectives {
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'font-src': string[];
  'connect-src': string[];
  'worker-src': string[];
  'frame-ancestors': string[];
  'form-action': string[];
  'base-uri': string[];
  'object-src': string[];
  'report-uri'?: string[];
  [key: string]: string[] | undefined;
}

/**
 * Middleware para configurar Content Security Policy (CSP)
 */
export function cspMiddleware(options: CSPOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Configurar diretivas CSP
    const directives: CSPDirectives = {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'worker-src': ["'self'"],
      'frame-ancestors': ["'self'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
      'object-src': ["'none'"]
    };

    // Adicionar URI de relatório, se fornecida
    if (options.reportUri) {
      directives['report-uri'] = [options.reportUri];
    }

    // Gerar nonce para scripts
    const nonce = Buffer.from(cryptoNode.randomBytes(16)).toString('base64');
    directives['script-src'].push(`'nonce-${nonce}'`);

    // Construir cabeçalho CSP
    const cspHeader = Object.entries(directives)
      .map(([key, values]) => `${key} ${(values || ['']).join(' ')}`)
      .join('; ');

    // Definir cabeçalhos
    res.setHeader('Content-Security-Policy', cspHeader);
    res.locals.cspNonce = nonce;

    next();
  };
}