"use client";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, LogIn, KeyRound, Mail } from 'lucide-react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';

const formSchema = z.object({
  email: z.string().email({ message: 'Por favor ingrese un correo válido.' }),
  password: z.string().min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
});

export default function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const appVersion = "APP.Versión.002";

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    if (!auth) {
        toast({
            variant: "destructive",
            title: "Error de configuración",
            description: "Firebase no está configurado correctamente.",
        });
        setIsLoading(false);
        return;
    }
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast({
        title: '¡Bienvenido!',
        description: 'Has iniciado sesión correctamente.',
      });
      router.push('/');
    } catch (error: any) {
      let errorMessage = 'Ocurrió un error inesperado durante el inicio de sesión.';

      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Correo electrónico o contraseña incorrectos. Por favor, inténtalo de nuevo.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'Esta cuenta de usuario ha sido deshabilitada.';
          break;
        case 'auth/too-many-requests':
            errorMessage = 'El acceso a esta cuenta ha sido temporalmente deshabilitado debido a muchos intentos fallidos. Por favor, intente de nuevo más tarde.';
            break;
        default:
          break;
      }
      
      toast({
        variant: 'destructive',
        title: 'Error de autenticación',
        description: errorMessage,
      });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/50 p-4">
      <div className="w-full max-w-md space-y-4 animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-2">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100 mb-4 transform hover:scale-105 transition-transform duration-300">
                <Image
                    src="/images/company-logo.png"
                    alt="Logotipo de Frio Alimentaria"
                    width={180}
                    height={51}
                    priority
                />
            </div>
            <div className="space-y-1 text-center">
                <h1 className="text-lg font-black tracking-tight text-primary uppercase whitespace-nowrap px-2">
                    CONTROL DE OPERACIONES LOGÍSTICAS
                </h1>
                <div className="h-0.5 w-12 bg-accent mx-auto rounded-full mt-1" />
            </div>
        </div>

        <Card className="border-none shadow-2xl bg-white/95 backdrop-blur-md">
          <CardHeader className="space-y-1 pb-4 pt-6">
            <CardTitle className="text-lg font-bold text-center flex items-center justify-center gap-2 text-gray-800">
                <LogIn className="h-4 w-4 text-primary" />
                Iniciar Sesión
            </CardTitle>
            <CardDescription className="text-center text-xs text-gray-500">
              Ingrese sus credenciales para acceder al sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs text-gray-700 font-semibold">Correo Electrónico</FormLabel>
                      <FormControl>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                            <Input 
                                placeholder="usuario@ejemplo.com" 
                                {...field} 
                                className="pl-10 h-10 bg-gray-50/50 border-gray-200 focus:bg-white transition-all rounded-lg text-sm"
                            />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-xs text-gray-700 font-semibold">Contraseña</FormLabel>
                      <FormControl>
                        <div className="relative group">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                            <Input 
                                type="password" 
                                placeholder="********" 
                                {...field} 
                                className="pl-10 h-10 bg-gray-50/50 border-gray-200 focus:bg-white transition-all rounded-lg text-sm"
                            />
                        </div>
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                 <div className="pt-2">
                   <Button 
                    type="submit" 
                    disabled={isLoading} 
                    className="w-full h-11 text-base font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 transform hover:-translate-y-0.5 transition-all rounded-lg active:scale-95"
                   >
                    {isLoading ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Ingresar
                      </>
                    )}
                  </Button>
                 </div>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="pb-6 pt-0 flex flex-col items-center gap-3">
              <Separator className="w-1/4 opacity-50" />
              <div className="flex flex-col items-center gap-0.5 opacity-60">
                  <p className="text-[9px] font-bold text-primary tracking-widest uppercase">Frio Alimentaria SAS</p>
                  <p className="text-[8px] font-mono text-gray-500">{appVersion}</p>
              </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}