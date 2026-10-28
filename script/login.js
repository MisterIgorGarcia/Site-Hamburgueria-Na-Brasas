/* =====================================================================
   FUNCIONALIDADES DA TELA DE LOGIN
   ===================================================================== */

const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const formLogin = document.getElementById('form-login');
const loginErro = document.getElementById('login-erro');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-entrar');
  const login = document.getElementById('inp-login').value.trim();
  const senha = document.getElementById('inp-senha').value;

  btn.disabled = true;
  btn.textContent = 'Verificando...';
  loginErro.textContent = '';

  try {
    // Chama a única função unificada
    const { data, error } = await supabaseClient.rpc('login_unificado', {
      p_login: login, 
      p_senha: senha
    });
    
    if (error) throw error;

    if (data?.success) {
      // Salva a sessão com o tipo que veio do banco ('admin' ou 'funcionario')
      localStorage.setItem('nabrasas_sessao', JSON.stringify({ id: data.id, tipo: data.tipo, nome: data.login }));

      // Redireciona baseado no tipo
      if (data.tipo === 'admin') {
        // Como o login.html está na pasta admin, o dashboard está no mesmo lugar
        window.location.href = 'administrador-dashboard.html';
      } else {
        // Funcionário volta uma pasta para achar o dashboard dele
        window.location.href = '../funcionario-dashboard.html';
      }
      return;
    }

    loginErro.textContent = 'Login ou senha inválidos.';

  } catch (err) {
    console.error(err);
    loginErro.textContent = 'Erro ao conectar. Tente novamente.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});