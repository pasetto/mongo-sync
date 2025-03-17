import { Request, Response, NextFunction } from 'express';

export function createCSPMiddleware(options: {
  reportOnly?: boolean;
  reportUri?: string;
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Definir política CSP para prevenir XSS e outros ataques
    const directives = {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'strict-dynamic'", "'nonce-{nonce}'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'", req.hostname],
      'worker-src': ["'self'", 'blob:'],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      'base-uri': ["'self'"],
      'object-src': ["'none'"],
    };

    // Adicionar report-uri se configurado
    if (options.reportUri) {
      directives['report-uri'] = [options.reportUri];
    }

    // Gerar nonce para scripts
    const nonce = Buffer.from(crypto.randomBytes(16)).toString('base64');
    
    // Substituir placeholder {nonce} por nonce real
    directives['script-src'] = directives['script-src'].map(
      src => src.replace('{nonce}', nonce)
    );

    // Construir cabeçalho CSP
    const cspValue = Object.entries(directives)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');

    // Definir cabeçalho CSP
    const headerName = options.reportOnly ? 
      'Content-Security-Policy-Report-Only' : 
      'Content-Security-Policy';
    
    res.setHeader(headerName, cspValue);
    
    // Disponibilizar nonce para uso nos templates
    res.locals.cspNonce = nonce;
    
    next();
  };
}