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
    <div className="min-h-screen flex w-full items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/50 p-4 sm:p-8">
      <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center mb-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 mb-6 transform hover:scale-105 transition-transform duration-300">
                <Image
                    src="/images/company-logo.png"
                    alt="Logotipo de Frio Alimentaria"
                    width={220}
                    height={63}
                    priority
                />
            </div>
            <div className="space-y-1 text-center">
                <h1 className="text-2xl font-black tracking-tight text-primary leading-tight px-4">
                    CONTROL DE OPERACIONES LOGÍSTICAS
                </h1>
                <div className="h-1 w-16 bg-accent mx-auto rounded-full mt-2" />
            </div>
        </div>

        <Card className="border-none shadow-2xl bg-white/95 backdrop-blur-md">
          <CardHeader className="space-y-1 pb-6 pt-8">
            <CardTitle className="text-xl font-bold text-center flex items-center justify-center gap-2 text-gray-800">
                <LogIn className="h-5 w-5 text-primary" />
                Iniciar Sesión
            </CardTitle>
            <CardDescription className="text-center text-gray-500">
              Ingrese su correo y contraseña para acceder al sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-semibold">Correo Electrónico</FormLabel>
                      <FormControl>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                            <Input 
                                placeholder="usuario@ejemplo.com" 
                                {...field} 
                                className="pl-10 h-12 bg-gray-50/50 border-gray-200 focus:bg-white transition-all rounded-lg"
                            />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-semibold">Contraseña</FormLabel>
                      <FormControl>
                        <div className="relative group">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary transition-colors" />
                            <Input 
                                type="password" 
                                placeholder="********" 
                                {...field} 
                                className="pl-10 h-12 bg-gray-50/50 border-gray-200 focus:bg-white transition-all rounded-lg"
                            />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                 <div className="pt-2">
                   <Button 
                    type="submit" 
                    disabled={isLoading} 
                    className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20 hover:shadow-primary/40 transform hover:-translate-y-0.5 transition-all rounded-lg active:scale-95"
                   >
                    {isLoading ? (
                      <Loader2 className="animate-spin h-5 w-5" />
                    ) : (
                      <>
                        <LogIn className="mr-2 h-5 w-5" />
                        Ingresar
                      </>
                    )}
                  </Button>
                 </div>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="pb-8 pt-2 flex flex-col items-center gap-4">
              <Separator className="w-1/3 opacity-50" />
              <div className="flex flex-col items-center gap-1 opacity-60">
                  <p className="text-[10px] font-bold text-primary tracking-widest uppercase">Frio Alimentaria SAS</p>
                  <p className="text-[9px] font-mono text-gray-500">{appVersion}</p>
              </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}