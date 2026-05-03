import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="size-6" />
          </div>
          <CardTitle>Acesso negado</CardTitle>
          <CardDescription>
            O seu perfil não tem permissão para esta área. Contacte o dono ou gerente da barbearia se precisar de acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild variant="default">
            <Link to="/dashboard">Voltar ao painel</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
